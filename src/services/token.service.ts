import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { parseDurationToMs } from '@/utils/time';
import { generateRandomToken, hashToken } from '@/services/crypto.service';
import { audit, AuditActions } from '@/services/audit.service';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
  iat: number;
  exp: number;
}

export interface TokenUser {
  id: string;
  email: string;
  role: string;
}

interface TokenContext {
  ipAddress?: string;
  userAgent?: string;
}

const ISSUER = 'mymasjid';


export const generateAccessToken = (user: TokenUser): string =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role, type: 'access' }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: ISSUER,
  });

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { issuer: ISSUER }) as TokenPayload;
    if (decoded.type !== 'access') {
      throw new AppError('Invalid token type', 401, true, ErrorCodes.TOKEN_INVALID);
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token expired', 401, true, ErrorCodes.TOKEN_EXPIRED);
    }
    throw new AppError('Invalid token', 401, true, ErrorCodes.TOKEN_INVALID);
  }
};



export interface RefreshTokenRecord {
  plainToken: string;
  tokenHash: string;
  expiresAt: Date;
}


export const createRefreshToken = (
  userId: string,
  ctx: TokenContext = {},
): RefreshTokenRecord & { db: { tokenHash: string; userId: string; expiresAt: Date; ipAddress?: string; userAgent?: string } } => {
  const plainToken = generateRandomToken(32);
  const expiresAt = new Date(Date.now() + parseDurationToMs(config.REFRESH_TOKEN_EXPIRES_IN));
  return {
    plainToken,
    tokenHash: hashToken(plainToken),
    expiresAt,
    db: {
      tokenHash: hashToken(plainToken),
      userId,
      expiresAt,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  };
};

export interface RotatedRefreshResult {
  plainToken: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}





export const rotateRefreshToken = async (
  oldPlainToken: string,
  ctx: TokenContext = {},
): Promise<RotatedRefreshResult> => {
  const tokenHash = hashToken(oldPlainToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new AppError('Invalid refresh token', 401, true, ErrorCodes.REFRESH_TOKEN_INVALID);
  }
  if (existing.revokedAt) {
    throw new AppError('Refresh token has been revoked', 401, true, ErrorCodes.REFRESH_TOKEN_REVOKED);
  }
  if (existing.expiresAt < new Date()) {
    throw new AppError('Refresh token expired', 401, true, ErrorCodes.REFRESH_TOKEN_EXPIRED);
  }

  const next = createRefreshToken(existing.userId, ctx);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByToken: next.tokenHash },
    }),
    prisma.refreshToken.create({ data: next.db }),
  ]);

  void audit({
    action: AuditActions.TOKEN_REFRESHED,
    actorId: existing.userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { rotatedFrom: existing.id },
  });

  return { plainToken: next.plainToken, userId: existing.userId, tokenHash: next.tokenHash, expiresAt: next.expiresAt };
};


export const revokeRefreshToken = async (plainToken: string): Promise<void> => {
  const tokenHash = hashToken(plainToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
