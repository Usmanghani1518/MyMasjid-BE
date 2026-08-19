import { prisma } from '@/config/database';
import { Prisma } from '@/generated/prisma/client';
import bcrypt from 'bcrypt';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { audit, AuditActions } from '@/services/audit.service';
import {
  generateAccessToken,
  generateRegistrationToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  TokenUser,
} from '@/services/token.service';
import { Role } from '@/generated/prisma/enums';

export interface TokenContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// ==================== Shared registration primitives ====================
// Used by the role registration services (donor / volunteer / masjid) so that
// identity concerns live in the auth module.

const BCRYPT_ROUNDS = 12;

/** bcrypt hash with the project's security rounds (12). */
export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_ROUNDS);

export interface NewUserInput {
  email: string;
  password: string;
  name: string;
  role: Role;
}

/**
 * Creates a user record with a hashed password.
 * Callers are responsible for uniqueness checks (resume flows) beforehand.
 * Accepts an optional transaction client so callers can create the user and
 * their role draft atomically.
 */
export const createUser = async (
  input: NewUserInput,
  tx: Prisma.TransactionClient = prisma,
) => {
  const email = input.email.trim().toLowerCase();
  return tx.user.create({
    data: {
      email,
      password: await hashPassword(input.password),
      name: input.name,
      role: input.role,
    },
  });
};

/** Short-lived token (30m) issued at registration step 1 to continue the flow. */
export const issueRegistrationToken = (user: TokenUser): string =>
  generateRegistrationToken(user);

/**
 * Persists a new refresh token and returns the full token pair.
 * Used by login and by registration completion for all roles.
 */
export const issueTokenPair = async (
  user: TokenUser,
  ctx: TokenContext = {},
): Promise<TokenPair> => {
  const refresh = createRefreshToken(user.id, ctx);
  await prisma.refreshToken.create({ data: refresh.db });
  return {
    accessToken: generateAccessToken(user),
    refreshToken: refresh.plainToken,
    refreshExpiresAt: refresh.expiresAt,
  };
};

const toTokenUser = (user: { id: string; email: string; role: string }): TokenUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

/** Password verification with timing-safe bcrypt compare. */
export const verifyPassword = async (user: { password: string }, plain: string): Promise<boolean> =>
  bcrypt.compare(plain, user.password);

export interface LoginResult {
  user: { id: string; email: string; name: string | null; role: string };
  tokens: TokenPair;
}

/** Email + password login for active accounts. */
export const login = async (
  email: string,
  password: string,
  ctx: TokenContext = {},
): Promise<LoginResult> => {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  const invalid = () =>
    new AppError('Invalid email or password', 401, true, ErrorCodes.INVALID_CREDENTIALS);

  if (!user || user.deletedAt) {
    throw invalid();
  }
  const ok = await verifyPassword(user, password);
  if (!ok) {
    void audit({
      action: AuditActions.LOGIN_FAILED,
      actorId: user.id,
      actorEmail: user.email,
      metadata: { email: normalized },
      ipAddress: ctx.ipAddress,
    });
    throw invalid();
  }
  if (!user.isActive) {
    throw new AppError('Account is disabled', 403, true, ErrorCodes.ACCOUNT_DISABLED);
  }

  const tokens = await issueTokenPair(toTokenUser(user), ctx);

  void audit({
    action: AuditActions.LOGIN_SUCCESS,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  };
};

export interface RefreshResult {
  user: { id: string; email: string; name: string | null; role: string };
  tokens: TokenPair;
}

/**
 * Rotates a refresh token (revokes the old one, issues a successor) and returns
 * a fresh access token. Enables reuse detection for stolen tokens.
 */
export const refresh = async (
  refreshToken: string,
  ctx: TokenContext = {},
): Promise<RefreshResult> => {
  const rotated = await rotateRefreshToken(refreshToken, ctx);
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user || user.deletedAt || !user.isActive) {
    throw new AppError('Account unavailable', 401, true, ErrorCodes.UNAUTHORIZED);
  }

  const accessToken = generateAccessToken(toTokenUser(user));

  void audit({
    action: AuditActions.TOKEN_REFRESHED,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens: {
      accessToken,
      refreshToken: rotated.plainToken,
      refreshExpiresAt: rotated.expiresAt,
    },
  };
};

/** Revokes a refresh token (logout). */
export const logout = async (refreshToken: string, ctx: TokenContext = {}): Promise<void> => {
  await revokeRefreshToken(refreshToken);
  void audit({
    action: AuditActions.LOGOUT,
    metadata: { action: 'refresh_token_revoked' },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};

export { Role };
