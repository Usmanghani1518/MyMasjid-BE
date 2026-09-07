import { prisma } from '@/config/database';
import { Prisma } from '@/generated/prisma/client';
import { logger } from '@/utils/helpers';

/**
 * Audit actions (stable strings). Names are grouped by domain so logs can be
 * filtered with a simple prefix or exact match.
 */
export const AuditActions = {
  // OTP
  OTP_GENERATED: 'OTP_GENERATED',
  OTP_RESENT: 'OTP_RESENT',
  OTP_VERIFIED: 'OTP_VERIFIED',
  OTP_VERIFY_FAILED: 'OTP_VERIFY_FAILED',
  OTP_LOCKED: 'OTP_LOCKED',

  // Admin / Compliance
  ADMIN_LISTED: 'ADMIN_LISTED',
  ADMIN_VIEWED: 'ADMIN_VIEWED',
  ADMIN_APPROVED: 'ADMIN_APPROVED',
  ADMIN_DENIED: 'ADMIN_DENIED',

  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',

  // Email
  EMAIL_SENT: 'EMAIL_SENT',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export interface AuditLogInput {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: AuditAction | string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an audit log row. Fire-and-forget by design: audit failures must never
 * break the request that triggered them, so failures are logged as warnings only.
 */
export const audit = async (input: AuditLogInput): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action }, 'Audit log write failed');
  }
};
