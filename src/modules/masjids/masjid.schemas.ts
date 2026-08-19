import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  phoneNumberSchema,
  countrySchema,
  idTypeSchema,
  idNumberSchema,
} from '@/utils/schemas';
import { MASJID_TYPES, MASJID_SERVICES, TRUSTEE_ROLES } from '@/utils/constants';
import { ErrorCodes } from '@/utils/errorCodes';

const currentYear = new Date().getFullYear();

/** Optional URL that also tolerates empty strings (common from web forms). */
const optionalUrl = z
  .union([z.string().trim().url('Enter a valid website URL'), z.literal('')])
  .transform((v) => (v === '' ? undefined : v))
  .optional();

/**
 * Step 1 — Institutional identity body. Consumed by the auth module's
 * `POST /auth/register` with `role: 'MASJID'` — the auth endpoints live in auth.
 */
export const masjidIdentityBody = z.object({
  masjidName: nameSchema,
  ownerName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  registrationNumber: z.string().trim().min(3, 'Enter a valid registration number').max(50).optional(),
  organizationType: z.enum(MASJID_TYPES, { message: 'Invalid organization type' }),
  charityNumber: z.string().trim().min(3, 'Enter a valid charity number').max(50).optional(),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Enter a valid country code').optional(),
  phoneNumber: phoneNumberSchema.optional(),
  address: z.string().trim().min(3, 'Enter a valid address').max(200),
  city: z.string().trim().min(1, 'Enter a valid city').max(100),
  state: z.string().trim().max(100).optional(),
  country: countrySchema,
  website: optionalUrl,
  establishedYear: z.coerce
    .number()
    .int()
    .min(1900, 'Enter a valid year')
    .max(currentYear, 'Year cannot be in the future')
    .optional(),
});

/** Step 2 — Organization profile. */
export const masjidOrganizationProfileSchema = z.object({
  body: z.object({
    description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
    missionStatement: z.string().trim().min(10, 'Mission statement must be at least 10 characters').max(2000),
    operatingHours: z.string().trim().max(300).optional(),
  }),
});

/** Step 3 — Services & compliance flags. */
export const masjidServicesComplianceSchema = z.object({
  body: z.object({
    services: z
      .array(z.enum(MASJID_SERVICES, { message: 'Invalid service' }), { message: 'Services are required' })
      .min(1, 'Select at least one service'),
    handlesZakat: z.boolean().default(false),
    handlesGiftAid: z.boolean().default(false),
    hasCharityRegistration: z.boolean().default(false),
    acceptsOnlineDonations: z.boolean().default(false),
    complianceNotes: z.string().trim().max(2000).optional(),
  }),
});

const trusteeSchema = z
  .object({
    fullName: nameSchema,
    email: emailSchema,
    phoneNumber: phoneNumberSchema.optional(),
    role: z.enum(TRUSTEE_ROLES, { message: 'Invalid trustee role' }),
    idType: idTypeSchema.optional(),
    idNumber: idNumberSchema.optional(),
  })
  .refine((t) => !t.idNumber || t.idType, {
    message: 'ID type is required when an ID number is provided',
    path: ['idType'],
    params: { code: ErrorCodes.INVALID_ID_TYPE },
  })
  .refine((t) => !t.idType || t.idNumber, {
    message: 'ID number is required when an ID type is selected',
    path: ['idNumber'],
    params: { code: ErrorCodes.ID_NUMBER_REQUIRED },
  });

/** Step 4a — Trustees (replaces the masjid's trustee list). */
export const masjidTrusteesSchema = z.object({
  body: z.object({
    trustees: z.array(trusteeSchema, { message: 'Trustees are required' }).min(1, 'Add at least one trustee').max(10),
  }),
});

/** Step 5 — Submit for review. */
export const masjidSubmitSchema = z.object({ body: z.object({}) });

/** Re-open a denied application for editing. */
export const masjidResubmitSchema = z.object({ body: z.object({}) });
