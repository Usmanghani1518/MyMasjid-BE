import { prisma } from '@/config/database';
import bcrypt from 'bcrypt';
import { Role, OtpPurpose, RegistrationStatus } from '@/generated/prisma/enums';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { encrypt, decrypt, maskSensitive } from '@/services/crypto.service';
import { audit, AuditActions } from '@/services/audit.service';
import { sendOtp as sendOtpCode, verifyOtp as verifyOtpCode } from '@/services/otp.service';
import {
  createUser,
  issueRegistrationToken,
  issueTokenPair,
  TokenContext,
  TokenPair,
} from '@/modules/auth/auth.service';

const ensureDonor = async (userId: string) => {
  const donor = await prisma.donor.findFirst({ where: { userId, deletedAt: null } });
  if (!donor) {
    throw new AppError('Donor registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }
  return donor;
};

/** Guards against out-of-order step calls: `required` is the minimum completed step. */
const requireStep = (current: number, required: number): void => {
  if (current < required) {
    throw new AppError('Registration step not completed', 409, true, ErrorCodes.REGISTRATION_STEP_INVALID);
  }
};

export const toSafeDonor = (
  donor: {
    id: string;
    fullName: string | null;
    phoneCountryCode: string | null;
    phoneNumber: string | null;
    address: string | null;
    city: string | null;
    country: string;
    dateOfBirth: Date | null;
    idType: string | null;
    idNumberEnc: string | null;
    interests: string[];
    registrationStep: number;
    status: RegistrationStatus;
    emailVerified: boolean;
    completedAt: Date | null;
  },
  user: { email: string },
) => {
  let idNumberMasked: string | null = null;
  if (donor.idNumberEnc) {
    try {
      idNumberMasked = maskSensitive(decrypt(donor.idNumberEnc, { entityType: 'Donor' }));
    } catch {
      idNumberMasked = null;
    }
  }
  return {
    id: donor.id,
    email: user.email,
    fullName: donor.fullName,
    phoneCountryCode: donor.phoneCountryCode,
    phoneNumber: donor.phoneNumber,
    address: donor.address,
    city: donor.city,
    country: donor.country,
    dateOfBirth: donor.dateOfBirth ? donor.dateOfBirth.toISOString() : null,
    idType: donor.idType,
    idNumberMasked,
    interests: donor.interests,
    registrationStep: donor.registrationStep,
    status: donor.status,
    emailVerified: donor.emailVerified,
    completedAt: donor.completedAt ? donor.completedAt.toISOString() : null,
  };
};

export interface RegistrationContext extends TokenContext {
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ==================== Step 1 — Account ====================

export interface AccountInput {
  email: string;
  password: string;
  fullName: string;
}

/**
 * Creates the account + donor draft (registrationStep=1), or resumes an existing
 * incomplete registration when the email + password match (allows continuing after
 * the 30-minute registration token expires).
 */
export const createAccount = async (
  input: AccountInput,
  ctx: RegistrationContext = {},
): Promise<{ registrationToken: string; donor: ReturnType<typeof toSafeDonor> }> => {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const donor = await prisma.donor.findFirst({ where: { userId: existing.id, deletedAt: null } });
    const resume =
      donor &&
      existing.role === Role.DONOR &&
      donor.status === RegistrationStatus.DRAFT &&
      !donor.completedAt &&
      (await bcrypt.compare(input.password, existing.password));

    if (!resume) {
      throw new AppError('An account with this email already exists', 409, true, ErrorCodes.EMAIL_ALREADY_EXISTS);
    }

    const registrationToken = issueRegistrationToken({ id: existing.id, email, role: existing.role });
    void audit({
      action: AuditActions.REGISTRATION_STEP_COMPLETED,
      actorId: existing.id,
      actorEmail: email,
      actorRole: existing.role,
      entityType: 'Donor',
      entityId: donor.id,
      metadata: { step: 1, resumed: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { registrationToken, donor: toSafeDonor(donor, existing) };
  }

  // Create the identity via the auth module's shared primitives (atomically with the draft).
  const { user, donor } = await prisma.$transaction(async (tx) => {
    const u = await createUser({ email, password: input.password, name: input.fullName, role: Role.DONOR }, tx);
    const d = await tx.donor.create({
      data: { userId: u.id, fullName: input.fullName, registrationStep: 1, status: RegistrationStatus.DRAFT },
    });
    return { user: u, donor: d };
  });

  const registrationToken = issueRegistrationToken({ id: user.id, email, role: user.role });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: user.id,
    actorEmail: email,
    actorRole: user.role,
    entityType: 'Donor',
    entityId: donor.id,
    metadata: { step: 1, resumed: false },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { registrationToken, donor: toSafeDonor(donor, user) };
};

// ==================== Step 2 — Profile ====================

export interface ProfileInput {
  fullName?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  country?: string;
  dateOfBirth?: Date;
  idType?: string;
  idNumber?: string;
}

export const saveProfile = async (
  userId: string,
  input: ProfileInput,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeDonor>> => {
  const donor = await ensureDonor(userId);
  requireStep(donor.registrationStep, 1);

  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phoneCountryCode !== undefined) data.phoneCountryCode = input.phoneCountryCode;
  if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
  if (input.address !== undefined) data.address = input.address;
  if (input.city !== undefined) data.city = input.city;
  if (input.country !== undefined) data.country = input.country;
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
  if (input.idType !== undefined) data.idType = input.idType;
  if (input.idNumber !== undefined) {
    data.idNumberEnc = encrypt(input.idNumber, { entityType: 'Donor', entityId: donor.id });
  }

  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: { ...data, registrationStep: Math.max(donor.registrationStep, 2) },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Donor',
    entityId: donor.id,
    metadata: { step: 2 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeDonor(updated, user);
};

// ==================== Step 3 — Interests ====================

export const saveInterests = async (
  userId: string,
  interests: string[],
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeDonor>> => {
  const donor = await ensureDonor(userId);
  requireStep(donor.registrationStep, 2);

  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: { interests, registrationStep: Math.max(donor.registrationStep, 3) },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Donor',
    entityId: donor.id,
    metadata: { step: 3 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeDonor(updated, user);
};

// ==================== Step 4 — Email OTP ====================

export const sendOtp = async (userId: string, email: string, ctx: RegistrationContext = {}): Promise<void> => {
  const donor = await ensureDonor(userId);
  requireStep(donor.registrationStep, 3);
  if (donor.emailVerified) {
    throw new AppError('Email already verified', 400, true, ErrorCodes.OTP_ALREADY_VERIFIED);
  }
  await sendOtpCode(email, OtpPurpose.DONOR_REGISTRATION, {
    recipientName: donor.fullName ?? undefined,
    actorId: userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};

export const verifyOtp = async (
  userId: string,
  email: string,
  code: string,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeDonor>> => {
  const donor = await ensureDonor(userId);
  requireStep(donor.registrationStep, 3);

  await verifyOtpCode(email, OtpPurpose.DONOR_REGISTRATION, code, {
    actorId: userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: { emailVerified: true, registrationStep: Math.max(donor.registrationStep, 4) },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Donor',
    entityId: donor.id,
    metadata: { step: 4, emailVerified: true },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeDonor(updated, user);
};

// ==================== Step 5 — Completion ====================

export const complete = async (
  userId: string,
  ctx: RegistrationContext = {},
): Promise<{ tokens: TokenPair; donor: ReturnType<typeof toSafeDonor> }> => {
  const donor = await ensureDonor(userId);
  requireStep(donor.registrationStep, 4);
  if (!donor.emailVerified) {
    throw new AppError('Email must be verified before completing registration', 400, true, ErrorCodes.EMAIL_VERIFICATION_REQUIRED);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.donor.updateMany({
      where: { id: donor.id, status: RegistrationStatus.DRAFT },
      data: { status: RegistrationStatus.ACTIVE, completedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError('Registration already completed', 409, true, ErrorCodes.REGISTRATION_COMPLETE);
    }
    return tx.donor.findUniqueOrThrow({ where: { id: donor.id } });
  });

  const tokens = await issueTokenPair({ id: user.id, email: user.email, role: user.role }, ctx);

  void audit({
    action: AuditActions.REGISTRATION_COMPLETED,
    actorId: userId,
    actorEmail: user.email,
    actorRole: user.role,
    entityType: 'Donor',
    entityId: donor.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { tokens, donor: toSafeDonor(updated, user) };
};
