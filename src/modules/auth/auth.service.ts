import { prisma } from '@/config/database';
import bcrypt from 'bcrypt';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { audit, AuditActions } from '@/services/audit.service';
import { queueApplicationSubmittedEmail } from '@/services/email.service';
import {
  generateAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  TokenUser,
} from '@/services/token.service';
import { Role } from '@/generated/prisma/enums';
import { OtpPurpose, RegistrationStatus } from '@/generated/prisma/enums';
import * as otpService from '@/services/otp.service';
import { generateRandomToken, hashToken } from '@/services/crypto.service';

export interface TokenContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const tokenEnvelope = (tokens: TokenPair) => ({
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  expiresIn: 3600,
  tokenType: 'Bearer',
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const pendingId = (role: 'donor' | 'volunteer' | 'masjid', id: string): string => `reg_${role}_${id}`;
const parsePendingId = (value: string): { role: 'donor' | 'volunteer' | 'masjid'; id: string } | null => {
  const match = /^reg_(donor|volunteer|masjid)_(.+)$/.exec(value);
  if (!match) return null;
  return { role: match[1] as 'donor' | 'volunteer' | 'masjid', id: match[2] };
};

class ContractError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message, statusCode, true, code);
  }
}

export const toContractUser = (user: { id: string; role: string; name: string | null; email: string }) => ({
  id: user.id,
  role: user.role === 'DONOR' ? 'donor' : user.role === 'VOLUNTEER' ? 'volunteer' : user.role === 'MASJID_ADMIN' ? 'masjid' : user.role.toLowerCase(),
  fullName: user.name ?? '',
  email: user.email,
});

const alreadyRegistered = () => new ContractError('An account with this email already exists.', 409, 'ALREADY_REGISTERED');

const pendingRegistration = (role: 'donor' | 'volunteer' | 'masjid', id: string, email: string) =>
  new ContractError('A pending registration already exists for this email.', 409, 'PENDING_REGISTRATION_EXISTS', {
    pendingRegistrationId: pendingId(role, id),
    pendingRole: role,
    email,
    canResendOtp: role !== 'masjid',
    retryAfterSeconds: 0,
  });

const findExistingRegistration = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { donor: true, volunteer: true, masjids: true },
  });
  if (!user || user.deletedAt) return null;
  if (user.isActive) throw alreadyRegistered();
  if (user.donor) return { role: 'donor' as const, id: user.id, user };
  if (user.volunteer) return { role: 'volunteer' as const, id: user.id, user };
  if (user.masjids[0]) return { role: 'masjid' as const, id: user.masjids[0].id, user };
  return null;
};

const BCRYPT_ROUNDS = 12;

const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS);





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


export const verifyPassword = async (user: { password: string }, plain: string): Promise<boolean> =>
  bcrypt.compare(plain, user.password);

export interface LoginResult {
  user: { id: string; email: string; fullName: string; role: string };
  tokens: TokenPair;
}


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
    user: toContractUser(user),
    tokens,
  };
};

export const startDonorRegistration = async (input: any, ctx: TokenContext = {}) => {
  const email = normalizeEmail(input.email);
  const existing = await findExistingRegistration(email);
  if (existing && existing.role !== 'donor') throw pendingRegistration(existing.role, existing.id, email);

  const user = await prisma.$transaction(async (tx) => {
    if (existing?.role === 'donor') {
      await tx.user.update({
        where: { id: existing.id },
        data: { name: input.fullName, password: await hashPassword(input.password) },
      });
      await tx.donor.update({
        where: { userId: existing.id },
        data: {
          fullName: input.fullName,
          phoneNumber: input.mobile,
          country: input.selectedCountry,
          city: input.selectedCity,
          address: input.selectedLanguage,
          interests: input.selectedCauses,
          status: RegistrationStatus.DRAFT,
        },
      });
      return existing.user;
    }
    const created = await tx.user.create({
      data: {
        email,
        password: await hashPassword(input.password),
        name: input.fullName,
        role: Role.DONOR,
        isActive: false,
        donor: {
          create: {
            fullName: input.fullName,
            phoneNumber: input.mobile,
            country: input.selectedCountry,
            city: input.selectedCity,
            address: input.selectedLanguage,
            interests: input.selectedCauses,
            status: RegistrationStatus.DRAFT,
          },
        },
      },
    });
    return created;
  });

  await prisma.otp.deleteMany({ where: { email, purpose: OtpPurpose.DONOR_REGISTRATION } });
  await otpService.sendOtp(email, OtpPurpose.DONOR_REGISTRATION, { ...ctx, actorId: user.id, recipientName: input.fullName });
  return { pendingRegistrationId: pendingId('donor', user.id), email, otpLength: 6, resendAvailableInSeconds: 57 };
};

export const startVolunteerRegistration = async (input: any, ctx: TokenContext = {}) => {
  const email = normalizeEmail(input.email);
  const existing = await findExistingRegistration(email);
  if (existing && existing.role !== 'volunteer') throw pendingRegistration(existing.role, existing.id, email);

  const user = await prisma.$transaction(async (tx) => {
    if (existing?.role === 'volunteer') {
      await tx.user.update({
        where: { id: existing.id },
        data: { name: input.fullName, password: await hashPassword(input.password) },
      });
      await tx.volunteer.update({
        where: { userId: existing.id },
        data: {
          fullName: input.fullName,
          phoneNumber: input.mobileNumber,
          country: input.country,
          city: input.city,
          bio: input.bio,
          skills: input.skills,
          interests: input.selectedInterests,
          availabilityDays: input.frequency ? [input.frequency] : [],
          status: RegistrationStatus.DRAFT,
        },
      });
      return existing.user;
    }
    const created = await tx.user.create({
      data: {
        email,
        password: await hashPassword(input.password),
        name: input.fullName,
        role: Role.VOLUNTEER,
        isActive: false,
        volunteer: {
          create: {
            fullName: input.fullName,
            phoneNumber: input.mobileNumber,
            country: input.country,
            city: input.city,
            bio: input.bio,
            skills: input.skills,
            interests: input.selectedInterests,
            availabilityDays: input.frequency ? [input.frequency] : [],
            status: RegistrationStatus.DRAFT,
          },
        },
      },
    });
    return created;
  });

  await prisma.otp.deleteMany({ where: { email, purpose: OtpPurpose.VOLUNTEER_REGISTRATION } });
  await otpService.sendOtp(email, OtpPurpose.VOLUNTEER_REGISTRATION, { ...ctx, actorId: user.id, recipientName: input.fullName });
  return { pendingRegistrationId: pendingId('volunteer', user.id), email, otpLength: 6, resendAvailableInSeconds: 120 };
};

export const verifyRegistrationOtp = async (pendingRegistrationId: string, code: string, expectedRole: 'donor' | 'volunteer', ctx: TokenContext = {}) => {
  const parsed = parsePendingId(pendingRegistrationId);
  if (!parsed || parsed.role !== expectedRole) throw new ContractError('Invalid registration.', 404, 'VALIDATION_ERROR');

  const user = await prisma.user.findUnique({ where: { id: parsed.id }, include: { donor: true, volunteer: true } });
  if (!user || user.deletedAt || user.isActive) throw new ContractError('Invalid registration.', 404, 'VALIDATION_ERROR');

  await otpService.verifyOtp(user.email, expectedRole === 'donor' ? OtpPurpose.DONOR_REGISTRATION : OtpPurpose.VOLUNTEER_REGISTRATION, code, { ...ctx, actorId: user.id });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: true,
      donor: expectedRole === 'donor' ? { update: { emailVerified: true, status: RegistrationStatus.ACTIVE, completedAt: new Date() } } : undefined,
      volunteer: expectedRole === 'volunteer' ? { update: { emailVerified: true, status: RegistrationStatus.ACTIVE, completedAt: new Date() } } : undefined,
    },
  });
  const tokens = await issueTokenPair(toTokenUser(updated), ctx);
  return { user: toContractUser(updated), tokens: tokenEnvelope(tokens) };
};

export const resendRegistrationOtp = async (pendingRegistrationId: string, expectedRole: 'donor' | 'volunteer', ctx: TokenContext = {}) => {
  const parsed = parsePendingId(pendingRegistrationId);
  if (!parsed || parsed.role !== expectedRole) throw new ContractError('Invalid registration.', 404, 'VALIDATION_ERROR');
  const user = await prisma.user.findUnique({ where: { id: parsed.id } });
  if (!user || user.deletedAt || user.isActive) throw new ContractError('Invalid registration.', 404, 'VALIDATION_ERROR');
  await otpService.resendOtp(user.email, expectedRole === 'donor' ? OtpPurpose.DONOR_REGISTRATION : OtpPurpose.VOLUNTEER_REGISTRATION, { ...ctx, actorId: user.id, recipientName: user.name ?? undefined });
  return { pendingRegistrationId, otpLength: 6, resendAvailableInSeconds: expectedRole === 'donor' ? 57 : 120 };
};

export const registerMasjid = async (input: any) => {
  const email = normalizeEmail(input.email);
  const existing = await findExistingRegistration(email);
  if (existing) throw pendingRegistration(existing.role, existing.id, email);

  const created = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(input.password),
      name: input.trustee.fullName,
      role: Role.MASJID_ADMIN,
      isActive: false,
      masjids: {
        create: {
          name: input.legalName,
          registrationNumber: input.registrationNumber,
          email,
          phoneNumber: input.contactNumber,
          description: input.bio,
          address: input.streetAddress,
          city: input.city,
          services: input.selectedServices,
          status: RegistrationStatus.PENDING_REVIEW,
          registrationStep: 4,
          submittedAt: new Date(),
          trustees: {
            create: {
              fullName: input.trustee.fullName,
              email,
              role: input.trustee.position,
              idNumberEnc: input.trustee.idNumber,
            },
          },
        },
      },
    },
    include: { masjids: true },
  });

  const app = created.masjids[0];
  const referenceId = `MM-${app.id.slice(0, 4).toUpperCase()}-${app.id.slice(-1).toUpperCase()}`;
  queueApplicationSubmittedEmail(email, { masjidName: app.name, referenceId });

  return {
    application: {
      id: `masjid_app_${app.id}`,
      referenceId,
      status: 'pending_review',
      submissionDate: (app.submittedAt ?? app.createdAt).toISOString(),
      primaryContact: input.trustee.fullName,
    },
  };
};

export const forgotPassword = async (emailInput: string, ctx: TokenContext = {}) => {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || !user.isActive) throw new ContractError('Invalid email.', 401, 'INVALID_CREDENTIALS');
  const reset = await prisma.passwordReset.create({ data: { email } });
  await otpService.sendOtp(email, OtpPurpose.PASSWORD_RESET, { ...ctx, actorId: user.id, recipientName: user.name ?? undefined });
  return { passwordResetId: `pwd_reset_${reset.id}`, email, otpLength: 6, resendAvailableInSeconds: 120 };
};

export const verifyPasswordOtp = async (passwordResetId: string, code: string, ctx: TokenContext = {}) => {
  const id = passwordResetId.replace(/^pwd_reset_/, '');
  const reset = await prisma.passwordReset.findUnique({ where: { id } });
  if (!reset || reset.usedAt) throw new ContractError('Invalid password reset.', 400, 'INVALID_OTP');
  await otpService.verifyOtp(reset.email, OtpPurpose.PASSWORD_RESET, code, ctx);
  const token = generateRandomToken(32);
  await prisma.passwordReset.update({
    where: { id },
    data: { verifiedAt: new Date(), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  return { passwordResetId, resetAuthorizationToken: token, expiresIn: 900 };
};

export const resetPassword = async (passwordResetId: string, token: string, passwordValue: string) => {
  const id = passwordResetId.replace(/^pwd_reset_/, '');
  const reset = await prisma.passwordReset.findUnique({ where: { id } });
  if (!reset || reset.usedAt || !reset.tokenHash || reset.tokenHash !== hashToken(token)) throw new ContractError('Reset token expired.', 400, 'RESET_TOKEN_EXPIRED');
  if (!reset.expiresAt || reset.expiresAt < new Date()) throw new ContractError('Reset token expired.', 400, 'RESET_TOKEN_EXPIRED');
  await prisma.$transaction([
    prisma.user.update({ where: { email: reset.email }, data: { password: await hashPassword(passwordValue) } }),
    prisma.passwordReset.update({ where: { id }, data: { usedAt: new Date() } }),
  ]);
  return { email: reset.email };
};

export const resendPasswordOtp = async (passwordResetId: string, ctx: TokenContext = {}) => {
  const id = passwordResetId.replace(/^pwd_reset_/, '');
  const reset = await prisma.passwordReset.findUnique({ where: { id } });
  if (!reset || reset.usedAt) throw new ContractError('Invalid password reset.', 400, 'INVALID_OTP');
  await otpService.resendOtp(reset.email, OtpPurpose.PASSWORD_RESET, ctx);
  return { passwordResetId, otpLength: 6, resendAvailableInSeconds: 120 };
};

export interface RefreshResult {
  user: { id: string; email: string; name: string | null; role: string };
  tokens: TokenPair;
}





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
