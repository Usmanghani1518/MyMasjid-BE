import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  phoneNumberSchema,
  countrySchema,
  idTypeSchema,
  idNumberSchema,
  dateOfBirthSchema,
} from '@/utils/schemas';
import { VOLUNTEER_SKILLS, AVAILABILITY_DAYS, AVAILABILITY_TIMES, DONOR_INTERESTS } from '@/utils/constants';
import { ErrorCodes } from '@/utils/errorCodes';

/**
 * Account step body (email + password + name). Consumed by the auth module's
 * `POST /auth/register` with `role: 'VOLUNTEER'` — the auth endpoints live in auth.
 */
export const volunteerAccountBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: nameSchema,
});

/** Step 2 — Profile & Skills. */
export const volunteerProfileSkillsSchema = z.object({
  body: z
    .object({
      fullName: nameSchema.optional(),
      phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Enter a valid country code').optional(),
      phoneNumber: phoneNumberSchema.optional(),
      address: z.string().trim().min(3, 'Enter a valid address').max(200).optional(),
      city: z.string().trim().min(1, 'Enter a valid city').max(100).optional(),
      country: countrySchema.optional(),
      dateOfBirth: dateOfBirthSchema.optional(),
      idType: idTypeSchema.optional(),
      idNumber: idNumberSchema.optional(),
      bio: z.string().trim().max(1000).optional(),
      skills: z
        .array(z.enum(VOLUNTEER_SKILLS, { message: 'Invalid skill' }))
        .min(1, 'Select at least one skill'),
    })
    .refine((data) => !data.idNumber || data.idType, {
      message: 'ID type is required when an ID number is provided',
      path: ['idType'],
      params: { code: ErrorCodes.INVALID_ID_TYPE },
    })
    .refine((data) => !data.idType || data.idNumber, {
      message: 'ID number is required when an ID type is selected',
      path: ['idNumber'],
      params: { code: ErrorCodes.ID_NUMBER_REQUIRED },
    }),
});

/** Step 3 — Interests & Availability. */
export const volunteerInterestsAvailabilitySchema = z.object({
  body: z.object({
    interests: z
      .array(z.enum(DONOR_INTERESTS, { message: 'Invalid interest' }))
      .min(1, 'Select at least one interest'),
    availabilityDays: z
      .array(z.enum(AVAILABILITY_DAYS, { message: 'Invalid day' }))
      .min(1, 'Select at least one day'),
    availabilityTimes: z
      .array(z.enum(AVAILABILITY_TIMES, { message: 'Invalid time' }))
      .min(1, 'Select at least one time'),
  }),
});
