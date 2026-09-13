import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

const apiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    error: z.object({
      code: z.enum([
        'VALIDATION_ERROR',
        'INVALID_CREDENTIALS',
        'ALREADY_REGISTERED',
        'PENDING_REGISTRATION_EXISTS',
        'INVALID_OTP',
        'EXPIRED_OTP',
        'OTP_RATE_LIMITED',
        'RESET_TOKEN_EXPIRED',
        'SERVER_ERROR',
      ]),
      fields: z.record(z.string(), z.string()).optional(),
      pendingRegistrationId: z.string().optional(),
      pendingRole: z.enum(['donor', 'volunteer', 'masjid']).optional(),
      email: z.string().email().optional(),
      canResendOtp: z.boolean().optional(),
      retryAfterSeconds: z.number().optional(),
    }),
  })
  .openapi('AuthErrorResponse');

const tokenSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    tokenType: z.literal('Bearer'),
  })
  .openapi('AuthTokens');

const userSchema = z
  .object({
    id: z.string(),
    role: z.enum(['donor', 'volunteer', 'masjid', 'admin', 'super_admin']),
    fullName: z.string(),
    email: z.string().email(),
  })
  .openapi('AuthUser');

const pendingRegistrationSchema = z
  .object({
    pendingRegistrationId: z.string(),
    email: z.string().email(),
    otpLength: z.literal(6),
    resendAvailableInSeconds: z.number(),
  })
  .openapi('PendingRegistrationResponse');

const authResultSchema = z.object({ user: userSchema, tokens: tokenSchema }).openapi('AuthResult');

const donorStartSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    mobile: z.string(),
    password: z.string().min(8),
    agreeToTerms: z.literal(true),
    selectedCountry: z.string().length(2),
    selectedCity: z.string(),
    selectedLanguage: z.enum(['English', 'Arabic', 'Urdu', 'Turkish', 'Malay', 'Indonesian', 'French']),
    bio: z.string().max(250).nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    selectedCauses: z.array(z.enum(['masjid', 'education', 'zakat', 'waqf', 'youth', 'emergency', 'water', 'food'])).min(1),
  })
  .openapi('DonorStartRequest');

const volunteerStartSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    mobileNumber: z.string(),
    password: z.string().min(8),
    agreeToTerms: z.literal(true),
    country: z.string().length(2),
    city: z.string(),
    skills: z.array(z.enum(['graphic-design', 'teaching', 'photography', 'fundraising', 'marketing', 'administration', 'medical', 'legal'])).optional(),
    bio: z.string().max(250).nullable().optional(),
    selectedInterests: z.array(z.enum(['masjid-construction', 'education', 'youth', 'food-banks', 'sadaqah-jariyah', 'health-services'])).min(1),
    frequency: z.enum(['weekly', 'bi-weekly', 'monthly', 'quarterly', 'events']).nullable().optional(),
  })
  .openapi('VolunteerStartRequest');

const registrationOtpSchema = z
  .object({
    pendingRegistrationId: z.string(),
    otp: z.string().regex(/^\d{6}$/),
  })
  .openapi('RegistrationOtpRequest');

const resendRegistrationOtpSchema = z
  .object({ pendingRegistrationId: z.string() })
  .openapi('ResendRegistrationOtpRequest');

const masjidRegisterSchema = z
  .object({
    legalName: z.string().min(2),
    registrationNumber: z.string(),
    email: z.string().email(),
    contactNumber: z.string(),
    password: z.string().min(8),
    bio: z.string().max(500),
    streetAddress: z.string(),
    city: z.string(),
    postalCode: z.string().min(3).max(12),
    logoUrl: z.string().nullable().optional(),
    selectedServices: z.array(z.enum(['zakat', 'youth', 'education', 'funeral', 'food', 'counseling'])).min(1),
    trustee: z.object({
      fullName: z.string().min(2),
      position: z.enum(['Chairman of the Board', 'Vice Chairman', 'Treasurer', 'Secretary', 'Imam', 'Trustee']),
      idNumber: z.string(),
    }),
    files: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })).min(1),
  })
  .openapi('MasjidRegisterRequest');

const masjidApplicationSchema = z
  .object({
    application: z.object({
      id: z.string(),
      referenceId: z.string(),
      status: z.literal('pending_review'),
      submissionDate: z.string().datetime(),
      primaryContact: z.string(),
    }),
  })
  .openapi('MasjidApplicationResponse');

const loginSchema = z
  .object({ email: z.string().email(), password: z.string(), remember: z.boolean().optional() })
  .openapi('LoginRequest');

const forgotPasswordSchema = z.object({ email: z.string().email() }).openapi('ForgotPasswordRequest');
const passwordResetStartSchema = z
  .object({ passwordResetId: z.string(), email: z.string().email(), otpLength: z.literal(6), resendAvailableInSeconds: z.number() })
  .openapi('PasswordResetStartResponse');
const passwordVerifyOtpSchema = z
  .object({ passwordResetId: z.string(), otp: z.string().regex(/^\d{6}$/) })
  .openapi('PasswordVerifyOtpRequest');
const passwordVerifyOtpResponseSchema = z
  .object({ passwordResetId: z.string(), resetAuthorizationToken: z.string(), expiresIn: z.literal(900) })
  .openapi('PasswordVerifyOtpResponse');
const resetPasswordSchema = z
  .object({ passwordResetId: z.string(), resetAuthorizationToken: z.string(), password: z.string().min(8) })
  .openapi('ResetPasswordRequest');
const resetPasswordResponseSchema = z.object({ email: z.string().email() }).openapi('ResetPasswordResponse');
const passwordResendOtpSchema = z.object({ passwordResetId: z.string() }).openapi('PasswordResendOtpRequest');
const refreshRequestSchema = z.object({ refreshToken: z.string().min(1) }).openapi('RefreshTokenRequest');
const logoutRequestSchema = z.object({ refreshToken: z.string().min(1) }).openapi('LogoutRequest');
const currentUserSchema = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string().email(), name: z.string().nullable(), role: z.enum(['USER', 'DONOR', 'VOLUNTEER', 'MASJID_ADMIN', 'ADMIN', 'SUPER_ADMIN']), isActive: z.boolean(), createdAt: z.string().datetime() }),
}).openapi('CurrentUserResponse');

const jsonBody = (schema: z.ZodTypeAny) => ({ body: { content: { 'application/json': { schema } } } });
const ok = (description: string, schema?: z.ZodTypeAny) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});
const authErrors = {
  400: ok('Validation error / invalid OTP / expired reset token', apiErrorSchema),
  401: ok('Invalid credentials', apiErrorSchema),
  409: ok('Already registered or pending registration exists', apiErrorSchema),
  429: ok('OTP rate limited', apiErrorSchema),
};

([
  ['post', '/auth/register/donor/start', 'Donor registration start', donorStartSchema, pendingRegistrationSchema, 201],
  ['post', '/auth/register/donor/verify-otp', 'Verify donor registration OTP', registrationOtpSchema, authResultSchema, 200],
  ['post', '/auth/register/donor/resend-otp', 'Resend donor registration OTP', resendRegistrationOtpSchema, pendingRegistrationSchema, 200],
  ['post', '/auth/register/volunteer/start', 'Volunteer registration start', volunteerStartSchema, pendingRegistrationSchema, 201],
  ['post', '/auth/register/volunteer/verify-otp', 'Verify volunteer registration OTP', registrationOtpSchema, authResultSchema, 200],
  ['post', '/auth/register/volunteer/resend-otp', 'Resend volunteer registration OTP', resendRegistrationOtpSchema, pendingRegistrationSchema, 200],
] satisfies Array<['post', string, string, z.ZodTypeAny, z.ZodTypeAny, number]>).forEach(
  ([method, path, summary, requestSchema, responseSchema, status]) => {
    registry.registerPath({
      method,
      path,
      tags: ['Auth and Registration'],
      summary,
      security: [],
      request: jsonBody(requestSchema),
      responses: { [status]: ok('Success', responseSchema), ...authErrors },
    });
  },
);

registry.registerPath({
  method: 'post',
  path: '/auth/register/masjid',
  tags: ['Auth and Registration'],
  summary: 'Submit masjid application for review',
  security: [],
  request: jsonBody(masjidRegisterSchema),
  responses: { 201: ok('Application submitted', masjidApplicationSchema), ...authErrors },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth and Registration'],
  summary: 'Sign in',
  security: [],
  request: jsonBody(loginSchema),
  responses: { 200: ok('Login successful', authResultSchema), ...authErrors },
});

registry.registerPath({
  method: 'post', path: '/auth/refresh', tags: ['Auth and Registration'], summary: 'Rotate a refresh token',
  description: 'Revokes the submitted refresh token and returns a new access/refresh pair. Reuse of the old token is rejected.',
  security: [], request: jsonBody(refreshRequestSchema),
  responses: { 200: ok('Tokens refreshed', authResultSchema), 401: ok('Refresh token invalid, revoked, or expired', apiErrorSchema), 429: ok('Rate limited', apiErrorSchema) },
});

registry.registerPath({
  method: 'post', path: '/auth/logout', tags: ['Auth and Registration'], summary: 'Log out and revoke the refresh token',
  description: 'Clients should clear their local session even if this request fails.', security: [], request: jsonBody(logoutRequestSchema),
  responses: { 200: ok('Logged out'), 400: ok('Invalid request', apiErrorSchema), 429: ok('Rate limited', apiErrorSchema) },
});

registry.registerPath({
  method: 'get', path: '/auth/me', tags: ['Auth and Registration'], summary: 'Get the authenticated user',
  description: 'The access token is checked against the current database account. Disabled/deleted accounts and tokens carrying a stale role are rejected.',
  security: [{ bearerAuth: [] }],
  responses: { 200: ok('Current user', currentUserSchema), 401: ok('Missing, expired, invalid, or stale token', apiErrorSchema), 404: ok('Account no longer exists or is inactive', apiErrorSchema) },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/forgot',
  tags: ['Auth and Registration'],
  summary: 'Start forgot password with email OTP',
  security: [],
  request: jsonBody(forgotPasswordSchema),
  responses: { 200: ok('OTP sent', passwordResetStartSchema), ...authErrors },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/verify-otp',
  tags: ['Auth and Registration'],
  summary: 'Verify forgot password OTP',
  security: [],
  request: jsonBody(passwordVerifyOtpSchema),
  responses: { 200: ok('OTP verified', passwordVerifyOtpResponseSchema), ...authErrors },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/reset',
  tags: ['Auth and Registration'],
  summary: 'Reset password with reset authorization token',
  security: [],
  request: jsonBody(resetPasswordSchema),
  responses: { 200: ok('Password reset', resetPasswordResponseSchema), ...authErrors },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/resend-otp',
  tags: ['Auth and Registration'],
  summary: 'Resend forgot password OTP',
  security: [],
  request: jsonBody(passwordResendOtpSchema),
  responses: { 200: ok('OTP sent', passwordResetStartSchema), ...authErrors },
});
