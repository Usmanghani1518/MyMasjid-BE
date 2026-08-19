import { z } from 'zod';
import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  COUNTRY_CODE_REGEX,
  PHONE_REGEX,
  ID_TYPES,
} from '@/utils/constants';
import { ErrorCodes } from '@/utils/errorCodes';

/** Custom issue code carried through zod `params`, read by the error mapper. */
export const withCode = (code: string) => ({ code });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: 'Password must contain at least one letter',
    params: withCode(ErrorCodes.PASSWORD_REQUIREMENTS),
  })
  .refine((value) => /[0-9]/.test(value), {
    message: 'Password must contain at least one number',
    params: withCode(ErrorCodes.PASSWORD_REQUIREMENTS),
  });

export const nameSchema = z.string().trim().min(2, 'Enter a valid name').max(100);

export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(PHONE_REGEX, { message: 'Enter a valid phone number' });

export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(COUNTRY_CODE_REGEX, 'Enter a valid 2-letter country code');

export const idTypeSchema = z.enum(ID_TYPES, { message: 'Invalid ID type' });

/** Optional ID number (must have idType when present — enforced per-step with refine). */
export const idNumberSchema = z.string().trim().min(4, 'Enter a valid ID number').max(50);

/** Date of birth: must be a real date in the past and ≥10 years ago. */
export const dateOfBirthSchema = z.coerce
  .date()
  .refine((d) => d < new Date(), {
    message: 'Date of birth must be in the past',
    params: withCode(ErrorCodes.INVALID_DATE_OF_BIRTH),
  })
  .refine((d) => d < new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000), {
    message: 'You must be at least 10 years old',
    params: withCode(ErrorCodes.INVALID_DATE_OF_BIRTH),
  });
