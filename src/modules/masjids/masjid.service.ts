import { prisma } from '@/config/database';
import { Prisma } from '@/generated/prisma/client';
import bcrypt from 'bcrypt';
import { Role, RegistrationStatus } from '@/generated/prisma/enums';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { encrypt, decrypt, maskSensitive } from '@/services/crypto.service';
import { audit, AuditActions } from '@/services/audit.service';
import {
  sendMasjidWelcomeEmail,
  sendApplicationSubmittedEmail,
} from '@/services/email.service';
import { createUser, issueRegistrationToken, TokenContext } from '@/modules/auth/auth.service';

/** Masjid statuses that allow editing/submission. */
const EDITABLE_STATUSES: RegistrationStatus[] = [RegistrationStatus.DRAFT, RegistrationStatus.DENIED];

const ensureMasjidByOwner = async (userId: string) => {
  const masjid = await prisma.masjid.findFirst({
    where: { ownerId: userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!masjid) {
    throw new AppError('Masjid registration not found', 404, true, ErrorCodes.REGISTRATION_NOT_FOUND);
  }
  return masjid;
};

const requireEditable = (masjid: { status: RegistrationStatus }): void => {
  if (!EDITABLE_STATUSES.includes(masjid.status)) {
    throw new AppError(
      'Masjid registration is not in an editable state',
      409,
      true,
      ErrorCodes.REGISTRATION_STEP_INVALID,
    );
  }
};

const requireStep = (current: number, required: number): void => {
  if (current < required) {
    throw new AppError('Registration step not completed', 409, true, ErrorCodes.REGISTRATION_STEP_INVALID);
  }
};

// ==================== Serializers ====================

export const toSafeTrustee = (trustee: {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  idType: string | null;
  idNumberEnc: string | null;
}) => {
  let idNumberMasked: string | null = null;
  if (trustee.idNumberEnc) {
    try {
      idNumberMasked = maskSensitive(decrypt(trustee.idNumberEnc, { entityType: 'Trustee', entityId: trustee.id }));
    } catch {
      idNumberMasked = null;
    }
  }
  return {
    id: trustee.id,
    fullName: trustee.fullName,
    email: trustee.email,
    phoneNumber: trustee.phoneNumber,
    role: trustee.role,
    idType: trustee.idType,
    idNumberMasked,
  };
};

type MasjidWithRelations = Awaited<ReturnType<typeof loadMasjidWithRelations>>;

const loadMasjidWithRelations = (masjidId: string) =>
  prisma.masjid.findUniqueOrThrow({
    where: { id: masjidId },
    include: { trustees: true, documents: true, owner: { select: { id: true, email: true, name: true, role: true } } },
  });

export const toSafeMasjid = (masjid: MasjidWithRelations) => ({
  id: masjid.id,
  name: masjid.name,
  owner: masjid.owner,
  // Identity
  registrationNumber: masjid.registrationNumber,
  organizationType: masjid.organizationType,
  charityNumber: masjid.charityNumber,
  email: masjid.email,
  phoneCountryCode: masjid.phoneCountryCode,
  phoneNumber: masjid.phoneNumber,
  address: masjid.address,
  city: masjid.city,
  state: masjid.state,
  country: masjid.country,
  website: masjid.website,
  establishedYear: masjid.establishedYear,
  // Profile
  description: masjid.description,
  missionStatement: masjid.missionStatement,
  operatingHours: masjid.operatingHours,
  // Services & compliance
  services: masjid.services,
  handlesZakat: masjid.handlesZakat,
  handlesGiftAid: masjid.handlesGiftAid,
  hasCharityRegistration: masjid.hasCharityRegistration,
  acceptsOnlineDonations: masjid.acceptsOnlineDonations,
  complianceNotes: masjid.complianceNotes,
  // Workflow
  registrationStep: masjid.registrationStep,
  status: masjid.status,
  submittedAt: masjid.submittedAt ? masjid.submittedAt.toISOString() : null,
  reviewedAt: masjid.reviewedAt ? masjid.reviewedAt.toISOString() : null,
  reviewNote: masjid.reviewNote,
  denialReasons: masjid.denialReasons,
  emailVerified: masjid.emailVerified,
  createdAt: masjid.createdAt.toISOString(),
  updatedAt: masjid.updatedAt.toISOString(),
  trustees: masjid.trustees.map(toSafeTrustee),
  documents: masjid.documents.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    purpose: d.purpose,
  })),
});

export interface RegistrationContext extends TokenContext {
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ==================== Step 1 — Institutional Identity ====================

export interface InstitutionalIdentityInput {
  masjidName: string;
  ownerName: string;
  email: string;
  password: string;
  registrationNumber?: string;
  organizationType: string;
  charityNumber?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  website?: string;
  establishedYear?: number;
}

export const createInstitutionalIdentity = async (
  input: InstitutionalIdentityInput,
  ctx: RegistrationContext = {},
): Promise<{ registrationToken: string; masjid: ReturnType<typeof toSafeMasjid> }> => {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const masjid = await prisma.masjid.findFirst({
      where: { ownerId: existing.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const resume =
      masjid &&
      existing.role === Role.MASJID_ADMIN &&
      EDITABLE_STATUSES.includes(masjid.status) &&
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
      entityType: 'Masjid',
      entityId: masjid.id,
      metadata: { step: 1, resumed: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    const full = await loadMasjidWithRelations(masjid.id);
    return { registrationToken, masjid: toSafeMasjid(full) };
  }

  // Create the identity via the auth module's shared primitives (atomically with the draft).
  const { user, masjid } = await prisma.$transaction(async (tx) => {
    const u = await createUser(
      { email, password: input.password, name: input.ownerName, role: Role.MASJID_ADMIN },
      tx,
    );
    const m = await tx.masjid.create({
      data: {
        name: input.masjidName,
        ownerId: u.id,
        registrationStep: 1,
        status: RegistrationStatus.DRAFT,
        registrationNumber: input.registrationNumber,
        organizationType: input.organizationType,
        charityNumber: input.charityNumber,
        email: input.email,
        phoneCountryCode: input.phoneCountryCode,
        phoneNumber: input.phoneNumber,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        website: input.website,
        establishedYear: input.establishedYear,
      },
    });
    return { user: u, masjid: m };
  });

  const registrationToken = issueRegistrationToken({ id: user.id, email, role: user.role });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: user.id,
    actorEmail: email,
    actorRole: user.role,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { step: 1, resumed: false },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Welcome email at account creation.
  await sendMasjidWelcomeEmail(email, { masjidName: input.masjidName, ownerName: input.ownerName });

  const full = await loadMasjidWithRelations(masjid.id);
  return { registrationToken, masjid: toSafeMasjid(full) };
};

// ==================== Step 2 — Organization Profile ====================

export interface OrganizationProfileInput {
  description: string;
  missionStatement: string;
  operatingHours?: string;
}

export const saveOrganizationProfile = async (
  userId: string,
  input: OrganizationProfileInput,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);
  requireEditable(masjid);
  requireStep(masjid.registrationStep, 1);

  const updated = await prisma.masjid.update({
    where: { id: masjid.id },
    data: {
      description: input.description,
      missionStatement: input.missionStatement,
      operatingHours: input.operatingHours,
      registrationStep: Math.max(masjid.registrationStep, 2),
    },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { step: 2 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid({ ...updated, trustees: full.trustees, documents: full.documents, owner: full.owner });
};

// ==================== Step 3 — Services & Compliance ====================

export interface ServicesComplianceInput {
  services: string[];
  handlesZakat: boolean;
  handlesGiftAid: boolean;
  hasCharityRegistration: boolean;
  acceptsOnlineDonations: boolean;
  complianceNotes?: string;
}

export const saveServicesCompliance = async (
  userId: string,
  input: ServicesComplianceInput,
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);
  requireEditable(masjid);
  requireStep(masjid.registrationStep, 2);

  const updated = await prisma.masjid.update({
    where: { id: masjid.id },
    data: {
      services: input.services,
      handlesZakat: input.handlesZakat,
      handlesGiftAid: input.handlesGiftAid,
      hasCharityRegistration: input.hasCharityRegistration,
      acceptsOnlineDonations: input.acceptsOnlineDonations,
      complianceNotes: input.complianceNotes,
      registrationStep: Math.max(masjid.registrationStep, 3),
    },
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { step: 3 },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid({ ...updated, trustees: full.trustees, documents: full.documents, owner: full.owner });
};

// ==================== Step 4 — Trustees ====================

export interface TrusteeInput {
  fullName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  idType?: string;
  idNumber?: string;
}

export const replaceTrustees = async (
  userId: string,
  trustees: TrusteeInput[],
  ctx: RegistrationContext = {},
): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);
  requireEditable(masjid);
  requireStep(masjid.registrationStep, 3);

  await prisma.$transaction(async (tx) => {
    await tx.trustee.deleteMany({ where: { masjidId: masjid.id } });
    await tx.trustee.createMany({
      data: trustees.map((t) => ({
        masjidId: masjid.id,
        fullName: t.fullName,
        email: t.email,
        phoneNumber: t.phoneNumber,
        role: t.role,
        idType: t.idType,
        idNumberEnc: t.idNumber ? encrypt(t.idNumber, { entityType: 'Trustee' }) : null,
      })),
    });
    await tx.masjid.update({
      where: { id: masjid.id },
      data: { registrationStep: Math.max(masjid.registrationStep, 4) },
    });
  });

  void audit({
    action: AuditActions.REGISTRATION_STEP_COMPLETED,
    actorId: userId,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { step: 4, trusteeCount: trustees.length },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid(full);
};

// ==================== Draft / status ====================

export const getDraft = async (userId: string): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);
  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid(full);
};

// ==================== Step 5 — Submit for Review ====================

export const submitForReview = async (userId: string, ctx: RegistrationContext = {}): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);
  requireEditable(masjid);
  requireStep(masjid.registrationStep, 4);

  const { trusteeCount, documentCount, ownerEmail } = await prisma.$transaction(async (tx) => {
    const trusteeCount = await tx.trustee.count({ where: { masjidId: masjid.id } });
    const countDocs = await tx.uploadedDocument.count({ where: { masjidId: masjid.id } });
    const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    if (trusteeCount < 1) {
      throw new AppError('Add at least one trustee before submitting', 400, true, ErrorCodes.AT_LEAST_ONE_TRUSTEE_REQUIRED);
    }
    if (countDocs < 1) {
      throw new AppError('Upload at least one document before submitting', 400, true, ErrorCodes.AT_LEAST_ONE_DOCUMENT_REQUIRED);
    }

    await tx.masjid.updateMany({
      where: { id: masjid.id, status: { in: EDITABLE_STATUSES } },
      data: {
        status: RegistrationStatus.PENDING_REVIEW,
        submittedAt: new Date(),
        denialReasons: Prisma.DbNull,
        reviewNote: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });

    return { trusteeCount, documentCount: countDocs, ownerEmail: owner.email };
  });

  void audit({
    action: AuditActions.REGISTRATION_SUBMITTED,
    actorId: userId,
    actorEmail: ownerEmail,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { trusteeCount, documentCount },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  await sendApplicationSubmittedEmail(ownerEmail, { masjidName: masjid.name });

  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid(full);
};

// ==================== Resubmit (reopen a denied application) ====================

export const resubmit = async (userId: string, ctx: RegistrationContext = {}): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await ensureMasjidByOwner(userId);

  if (masjid.status !== RegistrationStatus.DENIED) {
    throw new AppError('Only denied applications can be resubmitted', 409, true, ErrorCodes.REGISTRATION_NOT_DENIED);
  }

  const updated = await prisma.masjid.update({
    where: { id: masjid.id },
    data: {
      status: RegistrationStatus.DRAFT,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      denialReasons: Prisma.DbNull,
      reviewNote: null,
    },
  });

  void audit({
    action: AuditActions.REGISTRATION_RESUBMITTED,
    actorId: userId,
    entityType: 'Masjid',
    entityId: masjid.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const full = await loadMasjidWithRelations(masjid.id);
  return toSafeMasjid({ ...updated, trustees: full.trustees, documents: full.documents, owner: full.owner });
};

export { Role, RegistrationStatus };
