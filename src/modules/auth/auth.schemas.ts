import { z } from 'zod';
import { emailSchema } from '@/utils/schemas';
import { donorAccountBody } from '@/modules/donors/donor.schemas';
import { volunteerAccountBody } from '@/modules/volunteers/volunteer.schemas';
import { masjidIdentityBody } from '@/modules/masjids/masjid.schemas';

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

/**
 * Registration step 1 for every role. The account payload is role-specific, so
 * the body is a discriminated union keyed by `role`.
 */
export const registerSchema = z.object({
  body: z.discriminatedUnion('role', [
    donorAccountBody.extend({ role: z.literal('DONOR') }),
    volunteerAccountBody.extend({ role: z.literal('VOLUNTEER') }),
    masjidIdentityBody.extend({ role: z.literal('MASJID') }),
  ]),
});

/** Step 4a — Email OTP. The email + role come from the registration token. */
export const sendOtpSchema = z.object({ body: z.object({}) });

/** Step 4b — Verify email OTP. */
export const verifyOtpSchema = z.object({
  body: z.object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  }),
});

/** Step 4c/5 — Complete a donor/volunteer registration (role from the token). */
export const completeSchema = z.object({ body: z.object({}) });
