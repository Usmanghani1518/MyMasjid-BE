import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

const apiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.nullable(z.unknown()),
    errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })),
  })
  .openapi('ApiErrorResponse');

const userSchema = z
  .object({ id: z.string().uuid(), email: z.string().email(), name: z.string().nullable(), role: z.string() })
  .openapi('UserResponse');

const tokenResponseSchema = z
  .object({
    user: userSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
    refreshExpiresAt: z.string().datetime(),
  })
  .openapi('TokenResponse');

const loginRequestSchema = z
  .object({ email: z.string().email(), password: z.string().min(1) })
  .openapi('LoginRequest');

const refreshRequestSchema = z.object({ refreshToken: z.string() }).openapi('RefreshRequest');

const logoutRequestSchema = z.object({ refreshToken: z.string() }).openapi('LogoutRequest');

const verifyOtpRequestSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).openapi('VerifyOtpRequest');

const donorAccountSchema = z
  .object({ role: z.literal('DONOR'), email: z.string().email(), password: z.string().min(8), fullName: z.string() })
  .openapi('DonorRegisterRequest');

const volunteerAccountSchema = z
  .object({ role: z.literal('VOLUNTEER'), email: z.string().email(), password: z.string().min(8), fullName: z.string() })
  .openapi('VolunteerRegisterRequest');

const masjidIdentitySchema = z
  .object({
    role: z.literal('MASJID'),
    masjidName: z.string(),
    ownerName: z.string(),
    email: z.string().email(),
    password: z.string().min(8),
    organizationType: z.string(),
    address: z.string(),
    city: z.string(),
    country: z.string(),
    registrationNumber: z.string().optional(),
    charityNumber: z.string().optional(),
    phoneNumber: z.string().optional(),
    state: z.string().optional(),
    website: z.string().optional(),
    establishedYear: z.number().optional(),
  })
  .openapi('MasjidRegisterRequest');

const registerRequestSchema = z.discriminatedUnion('role', [
  donorAccountSchema,
  volunteerAccountSchema,
  masjidIdentitySchema,
]);

const registerResponseSchema = z
  .object({ registrationToken: z.string(), donor: z.unknown().optional(), volunteer: z.unknown().optional(), masjid: z.unknown().optional() })
  .openapi('RegisterResponse', { description: 'Registration token + role-specific draft' });

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Authentication'],
  summary: 'Step 1 — Create an account for any role (donor / volunteer / masjid)',
  description:
    'The `role` field selects the account payload. Returns a short-lived registration token (30m) used by the remaining registration steps.',
  security: [],
  request: { body: { content: { 'application/json': { schema: registerRequestSchema } } } },
  responses: {
    201: { description: 'Account created', content: { 'application/json': { schema: registerResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
    409: { description: 'Email already registered', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/send-otp',
  tags: ['Authentication'],
  summary: 'Step 4a — Send email OTP for donor/volunteer registration',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({}) } } } },
  responses: {
    200: { description: 'OTP sent' },
    401: { description: 'Registration token required', content: { 'application/json': { schema: apiErrorSchema } } },
    429: { description: 'Rate limited / cooldown / max resends', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/verify-otp',
  tags: ['Authentication'],
  summary: 'Step 4b — Verify email OTP',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: verifyOtpRequestSchema } } } },
  responses: {
    200: { description: 'Email verified' },
    400: { description: 'Invalid / expired code', content: { 'application/json': { schema: apiErrorSchema } } },
    429: { description: 'Rate limited / locked', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/complete',
  tags: ['Authentication'],
  summary: 'Step 5 — Complete a donor/volunteer registration and receive tokens',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({}) } } } },
  responses: {
    201: { description: 'Registration complete', content: { 'application/json': { schema: tokenResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
    401: { description: 'Registration token required', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Authentication'],
  summary: 'Login with email and password',
  description: 'Returns a full access token (7d) + revocable refresh token (30d)',
  security: [],
  request: { body: { content: { 'application/json': { schema: loginRequestSchema } } } },
  responses: {
    200: { description: 'Login successful', content: { 'application/json': { schema: tokenResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Authentication'],
  summary: 'Rotate refresh token and get a new access token',
  security: [],
  request: { body: { content: { 'application/json': { schema: refreshRequestSchema } } } },
  responses: {
    200: { description: 'New token pair', content: { 'application/json': { schema: tokenResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
    401: { description: 'Invalid / revoked / expired refresh token', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Authentication'],
  summary: 'Revoke a refresh token (logout)',
  security: [],
  request: { body: { content: { 'application/json': { schema: logoutRequestSchema } } } },
  responses: {
    200: { description: 'Logged out' },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentication'],
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: userSchema } } },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});
