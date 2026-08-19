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

const ensureVolunteer = async (userId: string) => {
  const volunteer = await prisma.volunteer.findFirst({ where: { userId, deletedAt: null } });
  if (!volunteer) {
    throw new AppError('Volunteer registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }
  return volunteer;
};

const requireStep = (current: number, required: number): void => {
  if (current < required) {
    throw new AppError('Registration step not completed', 409, true, ErrorCodes.REGISTRATION_STEP_INVALID);
  }
};

export const toSafeVolunteer = (
  volunteer: {
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
    bio: string | null;
    skills: string[];
    interests: string[];
    availabilityDays: string[];
    availabilityTimes: string[];
    registrationStep: number;
    status: RegistrationStatus;
    emailVerified: boolean;
    completedAt: Date | null;
  },
  user: { email: string },
) => {
  let idNumberMasked: string | null = null;
  if (volunteer.idNumberEnc) {
    try {
      idNumberMasked = maskSensitive(decrypt(volunteer.idNumberEnc, { entityType: 'Volunteer' }));
    } catch {
      idNumberMasked = null;
    }
  }
  return {
    id: volunteer.id,
    email: user.email,
    fullName: volunteer.fullName,
    phoneCountryCode: volunteer.phoneCountryCode,
    phoneNumber: volunteer.phoneNumber,
    address: volunteer.address,
    city: volunteer.city,
    country: volunteer.country,
    dateOfBirth: volunteer.dateOfBirth ? volunteer.dateOfBirth.toISOString() : null,
    idType: volunteer.idType,
    idNumberMasked,
    bio: volunteer.bio,
    skills: volunteer.skills,
    interests: volunteer.interests,
    availabilityDays: volunteer.availabilityDays,
    availabilityTimes: volunteer.availabilityTimes,
    registrationStep: volunteer.registrationStep,
    status: volunteer.status,
    emailVerified: volunteer.emailVerified,
    completedAt: volunteer.completedAt ? volunteer.completedAt.toISOString() : null,
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

export const createAccount = async (
  input: AccountInput,
  ctx: RegistrationContext = {},
): Promise<{ registrationToken: string; volunteer: ReturnType<typeof toSafeVolunteer> }> => {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const volunteer = await prisma.volunteer.findFirst({ where: { userId: existing.id, deletedAt: null } });
    const resume =
      volunteer &&
      existing.role === Role.VOLUNTEER &&
      volunteer.status === RegistrationStatus.DRAFT &&
      !volunteer.completedAt &&
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
      entityType: 'Volunteer',
      entityId: volunteer.id,
      metadata: { step: 1, resumed: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { registrationToken, volunteer: toSafeVolunteer(volunteer, existing) };
  }

  // Create the identity via the auth module's shared primitives (atomically with the draft).
  const { user, volunteer } = await prisma.$transaction(async (tx) => {
    const u = await createUser({ email, password: input.password, name: input.fullName, role: Role.VOLUNTEER }, tx);
    const v = await tx.volunteer.create({
      data: { userId: u.id, fullName: input.fullName, registrationStep: 1, status: RegistrationStatus.DRAFT },
    });
    return { user: u, volunteer: v };
  });

  const registrationToken = issueRegistrationToken({ id: user.id, email, role: user.role });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: user.id,
    actorEmail: email,
    actorRole: user.role,
    entityType: 'Volunteer',
    entityId: volunteer.id,
    metadata: { step: 1, resumed: false },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { registrationToken, volunteer: toSafeVolunteer(volunteer, user) };
};

// ==================== Step 2 — Profile & Skills ====================

export interface ProfileSkillsInput {
  fullName?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  country?: string;
  dateOfBirth?: Date;
  idType?: string;
  idNumber?: string;
  bio?: string;
  skills: string[];
}

export const saveProfileSkills = async (
  userId: string,
  input: ProfileSkillsInput,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeVolunteer>> => {
  const volunteer = await ensureVolunteer(userId);
  requireStep(volunteer.registrationStep, 1);

  const data: Record<string, unknown> = { skills: input.skills };
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phoneCountryCode !== undefined) data.phoneCountryCode = input.phoneCountryCode;
  if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
  if (input.address !== undefined) data.address = input.address;
  if (input.city !== undefined) data.city = input.city;
  if (input.country !== undefined) data.country = input.country;
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
  if (input.idType !== undefined) data.idType = input.idType;
  if (input.idNumber !== undefined) {
    data.idNumberEnc = encrypt(input.idNumber, { entityType: 'Volunteer', entityId: volunteer.id });
  }
  if (input.bio !== undefined) data.bio = input.bio;

  const updated = await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { ...data, registrationStep: Math.max(volunteer.registrationStep, 2) },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Volunteer',
    entityId: volunteer.id,
    metadata: { step: 2 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeVolunteer(updated, user);
};

// ==================== Step 3 — Interests & Availability ====================

export interface InterestsAvailabilityInput {
  interests: string[];
  availabilityDays: string[];
  availabilityTimes: string[];
}

export const saveInterestsAvailability = async (
  userId: string,
  input: InterestsAvailabilityInput,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeVolunteer>> => {
  const volunteer = await ensureVolunteer(userId);
  requireStep(volunteer.registrationStep, 2);

  const updated = await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: {
      interests: input.interests,
      availabilityDays: input.availabilityDays,
      availabilityTimes: input.availabilityTimes,
      registrationStep: Math.max(volunteer.registrationStep, 3),
    },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Volunteer',
    entityId: volunteer.id,
    metadata: { step: 3 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeVolunteer(updated, user);
};

// ==================== Step 4 — Email OTP + Completion ====================

export const sendOtp = async (userId: string, email: string, ctx: RegistrationContext = {}): Promise<void> => {
  const volunteer = await ensureVolunteer(userId);
  requireStep(volunteer.registrationStep, 3);
  if (volunteer.emailVerified) {
    throw new AppError('Email already verified', 400, true, ErrorCodes.OTP_ALREADY_VERIFIED);
  }
  await sendOtpCode(email, OtpPurpose.VOLUNTEER_REGISTRATION, {
    recipientName: volunteer.fullName ?? undefined,
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
): Promise<ReturnType<typeof toSafeVolunteer>> => {
  const volunteer = await ensureVolunteer(userId);
  requireStep(volunteer.registrationStep, 3);

  await verifyOtpCode(email, OtpPurpose.VOLUNTEER_REGISTRATION, code, {
    actorId: userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const updated = await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { emailVerified: true, registrationStep: Math.max(volunteer.registrationStep, 4) },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Volunteer',
    entityId: volunteer.id,
    metadata: { step: 4, emailVerified: true },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toSafeVolunteer(updated, user);
};

export const complete = async (
  userId: string,
  ctx: RegistrationContext = {},
): Promise<{ tokens: TokenPair; volunteer: ReturnType<typeof toSafeVolunteer> }> => {
  const volunteer = await ensureVolunteer(userId);
  requireStep(volunteer.registrationStep, 4);
  if (!volunteer.emailVerified) {
    throw new AppError('Email must be verified before completing registration', 400, true, ErrorCodes.EMAIL_VERIFICATION_REQUIRED);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.volunteer.updateMany({
      where: { id: volunteer.id, status: RegistrationStatus.DRAFT },
      data: { status: RegistrationStatus.ACTIVE, completedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError('Registration already completed', 409, true, ErrorCodes.REGISTRATION_COMPLETE);
    }
    return tx.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } });
  });

  const tokens = await issueTokenPair({ id: user.id, email: user.email, role: user.role }, ctx);

  void audit({
    action: AuditActions.REGISTRATION_COMPLETED,
    actorId: userId,
    actorEmail: user.email,
    actorRole: user.role,
    entityType: 'Volunteer',
    entityId: volunteer.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { tokens, volunteer: toSafeVolunteer(updated, user) };
};
