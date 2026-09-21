import { prisma } from '@/config/database';
import { config } from '@/config';
import { OtpPurpose } from '@/generated/prisma/enums';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { generateOtpCode, hashOtp } from '@/services/crypto.service';
import { audit, AuditActions } from '@/services/audit.service';
import {
  queueDonorOtpEmail,
  queueVolunteerOtpEmail,
  queuePasswordResetOtpEmail,
} from '@/services/email.service';

export interface OtpContext {
  recipientName?: string;
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const COOLDOWN_MS = config.OTP_RESEND_COOLDOWN_SECONDS * 1000;
const LOCK_MS = config.OTP_LOCK_MINUTES * 60_000;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const findLatest = (email: string, purpose: OtpPurpose) =>
  prisma.otp.findFirst({
    where: { email: normalizeEmail(email), purpose },
    orderBy: { createdAt: 'desc' },
  });

const queuePurposeEmail = (to: string, purpose: OtpPurpose, recipientName: string | undefined, code: string): void => {
  const name = recipientName ?? 'there';
  const minutes = config.OTP_EXPIRES_MINUTES;
  switch (purpose) {
    case OtpPurpose.DONOR_REGISTRATION:
      queueDonorOtpEmail(to, { name, code, expiresInMinutes: minutes });
      return;
    case OtpPurpose.VOLUNTEER_REGISTRATION:
      queueVolunteerOtpEmail(to, { name, code, expiresInMinutes: minutes });
      return;
    case OtpPurpose.PASSWORD_RESET:
      queuePasswordResetOtpEmail(to, { name, code, expiresInMinutes: minutes });
      return;
    default:
      queueDonorOtpEmail(to, { name, code, expiresInMinutes: minutes });
  }
};





export const sendOtp = async (
  email: string,
  purpose: OtpPurpose,
  ctx: OtpContext = {},
): Promise<{ cooldownUntil: Date | null }> => {
  const normalized = normalizeEmail(email);
  const existing = await findLatest(normalized, purpose);

  if (existing) {
    if (existing.verifiedAt) {
      throw new AppError('Email already verified', 400, true, ErrorCodes.OTP_ALREADY_VERIFIED);
    }
    if (existing.lockUntil && existing.lockUntil > new Date()) {
      throw new AppError('Too many attempts. Please try again later.', 429, true, ErrorCodes.OTP_LOCKED);
    }
    if (existing.lastSentAt) {
      const since = Date.now() - existing.lastSentAt.getTime();
      if (since < COOLDOWN_MS) {
        throw new AppError(
          `Please wait before requesting another code`,
          429,
          true,
          ErrorCodes.OTP_COOLDOWN,
        );
      }
    }
    if (existing.resendCount >= config.OTP_MAX_RESENDS) {
      throw new AppError('Maximum resend limit reached', 429, true, ErrorCodes.OTP_MAX_RESENDS);
    }
  }

  const code = generateOtpCode(config.OTP_LENGTH);
  const codeHash = hashOtp(normalized, code);
  const expiresAt = new Date(Date.now() + config.OTP_EXPIRES_MINUTES * 60_000);
  const now = new Date();

  if (existing) {
    await prisma.otp.update({
      where: { id: existing.id },
      data: {
        codeHash,
        expiresAt,
        attempts: 0,
        lockUntil: null,
        verifiedAt: null,
        usedAt: null,
        resendCount: existing.resendCount + 1,
        lastSentAt: now,
      },
    });
  } else {
    await prisma.otp.create({
      data: { email: normalized, purpose, codeHash, expiresAt, lastSentAt: now, resendCount: 0 },
    });
  }

  const action = existing ? AuditActions.OTP_RESENT : AuditActions.OTP_GENERATED;
  void audit({
    action,
    actorId: ctx.actorId,
    entityType: 'Otp',
    metadata: { email: normalized, purpose },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  queuePurposeEmail(normalized, purpose, ctx.recipientName, code);

  return { cooldownUntil: new Date(Date.now() + COOLDOWN_MS) };
};


export const resendOtp = sendOtp;





export const verifyOtp = async (
  email: string,
  purpose: OtpPurpose,
  code: string,
  ctx: OtpContext = {},
): Promise<void> => {
  const normalized = normalizeEmail(email);
  const record = await findLatest(normalized, purpose);

  if (!record || record.verifiedAt) {
    throw new AppError('Invalid OTP code', 400, true, ErrorCodes.OTP_INVALID);
  }
  if (record.lockUntil && record.lockUntil > new Date()) {
    throw new AppError('Too many attempts. Please try again later.', 429, true, ErrorCodes.OTP_LOCKED);
  }
  if (record.expiresAt < new Date()) {
    throw new AppError('OTP code has expired', 400, true, ErrorCodes.OTP_EXPIRED);
  }

  if (hashOtp(normalized, code) !== record.codeHash) {
    const attempts = record.attempts + 1;
    let lockUntil: Date | null = null;

    if (attempts >= config.OTP_MAX_ATTEMPTS) {
      lockUntil = new Date(Date.now() + LOCK_MS);
      void audit({
        action: AuditActions.OTP_LOCKED,
        actorId: ctx.actorId,
        metadata: { email: normalized, purpose },
        ipAddress: ctx.ipAddress,
      });
    }

    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts: attempts >= config.OTP_MAX_ATTEMPTS ? 0 : attempts, lockUntil },
    });

    void audit({
      action: AuditActions.OTP_VERIFY_FAILED,
      actorId: ctx.actorId,
      metadata: { email: normalized, purpose, attempts },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    throw new AppError('Invalid OTP code', 400, true, ErrorCodes.OTP_INVALID);
  }

  await prisma.otp.update({
    where: { id: record.id },
    data: { verifiedAt: new Date(), usedAt: new Date() },
  });

  void audit({
    action: AuditActions.OTP_VERIFIED,
    actorId: ctx.actorId,
    metadata: { email: normalized, purpose },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};
