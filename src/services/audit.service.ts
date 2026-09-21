import { prisma } from '@/config/database';
import { Prisma } from '@/generated/prisma/client';
import { logger } from '@/utils/helpers';





export const AuditActions = {
  
  OTP_GENERATED: 'OTP_GENERATED',
  OTP_RESENT: 'OTP_RESENT',
  OTP_VERIFIED: 'OTP_VERIFIED',
  OTP_VERIFY_FAILED: 'OTP_VERIFY_FAILED',
  OTP_LOCKED: 'OTP_LOCKED',

  
  ADMIN_LISTED: 'ADMIN_LISTED',
  ADMIN_VIEWED: 'ADMIN_VIEWED',
  ADMIN_APPROVED: 'ADMIN_APPROVED',
  ADMIN_DENIED: 'ADMIN_DENIED',

  
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',

  
  EMAIL_SENT: 'EMAIL_SENT',

  
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
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
