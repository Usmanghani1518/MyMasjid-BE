import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please enter a valid email');

const name = z.string().trim().min(2, 'Please enter a valid name');
const password = z.string().min(8, 'Password must be at least 8 characters');
const otp = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
const phone = z
  .string()
  .trim()
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }, 'Please enter a valid phone number')
  .transform((value) => value.replace(/\D/g, ''));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value ?? null);

const id = z.string().trim().min(1);
const isoCountry = z.string().trim().toUpperCase().min(2).max(2);
const city = z.string().trim().min(1, 'City is required');
const urlish = z.string().trim().optional().nullable().transform((value) => value || null);

const donorLanguages = ['English', 'Arabic', 'Urdu', 'Turkish', 'Malay', 'Indonesian', 'French'] as const;
const donorCauses = ['masjid', 'education', 'zakat', 'waqf', 'youth', 'emergency', 'water', 'food'] as const;
const volunteerSkills = ['graphic-design', 'teaching', 'photography', 'fundraising', 'marketing', 'administration', 'medical', 'legal'] as const;
const volunteerInterests = ['masjid-construction', 'education', 'youth', 'food-banks', 'sadaqah-jariyah', 'health-services'] as const;
const volunteerFrequency = ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'events'] as const;
const masjidServices = ['zakat', 'youth', 'education', 'funeral', 'food', 'counseling'] as const;
const trusteePositions = ['Chairman of the Board', 'Vice Chairman', 'Treasurer', 'Secretary', 'Imam', 'Trustee'] as const;

export const donorStartSchema = z.object({
  body: z.object({
    fullName: name,
    email,
    mobile: phone,
    password,
    agreeToTerms: z.literal(true, { message: 'You must agree to the terms' }),
    selectedCountry: isoCountry,
    selectedCity: city,
    selectedLanguage: z.enum(donorLanguages),
    bio: optionalText(250),
    photoUrl: urlish,
    selectedCauses: z.array(z.enum(donorCauses)).min(1, 'Select at least one cause'),
  }),
});

export const volunteerStartSchema = z.object({
  body: z.object({
    fullName: name,
    email,
    mobileNumber: phone,
    password,
    agreeToTerms: z.literal(true, { message: 'You must agree to the terms' }),
    country: isoCountry,
    city,
    skills: z.array(z.enum(volunteerSkills)).default([]),
    bio: optionalText(250),
    selectedInterests: z.array(z.enum(volunteerInterests)).min(1, 'Select at least one interest'),
    frequency: z.enum(volunteerFrequency).optional().nullable().transform((value) => value ?? null),
  }),
});

export const verifyRegistrationOtpSchema = z.object({
  body: z.object({
    pendingRegistrationId: id,
    otp,
  }),
});

export const resendRegistrationOtpSchema = z.object({
  body: z.object({
    pendingRegistrationId: id,
  }),
});

export const masjidRegisterSchema = z.object({
  body: z.object({
    legalName: name,
    registrationNumber: z.string().trim().min(1),
    email,
    contactNumber: phone,
    bio: z.string().trim().min(1, 'Bio is required').max(500),
    streetAddress: z.string().trim().min(1),
    city,
    postalCode: z.string().trim().min(3).max(12),
    logoUrl: urlish,
    selectedServices: z.array(z.enum(masjidServices)).min(1, 'Select at least one service'),
    trustee: z.object({
      fullName: name,
      position: z.enum(trusteePositions),
      idNumber: z.string().trim().min(1),
    }),
    files: z.array(z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      status: z.string().trim().min(1),
    })).min(1, 'Upload at least one file'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Password is required'),
    remember: z.boolean().optional().default(false),
  }),
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1, 'Refresh token is required') }),
});

export const logoutSchema = refreshSchema;

export const forgotPasswordSchema = z.object({ body: z.object({ email }) });

export const verifyPasswordOtpSchema = z.object({
  body: z.object({
    passwordResetId: id,
    otp,
  }),
});

const passwordScore = (value: string) =>
  [value.length >= 8, /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;

export const resetPasswordSchema = z.object({
  body: z.object({
    passwordResetId: id,
    resetAuthorizationToken: z.string().trim().min(1),
    password: z.string().refine((value) => passwordScore(value) >= 3, 'Password is too weak'),
  }),
});

export const resendPasswordOtpSchema = z.object({
  body: z.object({ passwordResetId: id }),
});
