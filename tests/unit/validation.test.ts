import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toApiErrors, ValidationError } from '@/utils/validation';
import { emailSchema, passwordSchema } from '@/utils/schemas';
import { ErrorCodes } from '@/utils/errorCodes';

describe('validation mapper', () => {
  it('maps an invalid email to INVALID_EMAIL with the field name', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    const errors = toApiErrors(result.error!);
    expect(errors[0]).toMatchObject({ field: '', code: 'INVALID_EMAIL' });
  });

  it('maps a missing required field to FIELD_REQUIRED', () => {
    const donorAccountBody = z.object({
      email: z.string(),
      password: z.string(),
      fullName: z.string(),
    });
    const result = donorAccountBody.safeParse({});
    const errors = toApiErrors(result.error!);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email', code: 'FIELD_REQUIRED' }),
        expect.objectContaining({ field: 'password', code: 'FIELD_REQUIRED' }),
        expect.objectContaining({ field: 'fullName', code: 'FIELD_REQUIRED' }),
      ]),
    );
  });

  it('maps a too-short password to PASSWORD_TOO_SHORT', () => {
    // Wrap the schema the way request schemas do, so the field path is "password".
    const wrapped = z.object({ body: z.object({ password: passwordSchema }) });
    const result = wrapped.safeParse({ body: { password: 'Ab1' } });
    const errors = toApiErrors(result.error!);
    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password', code: 'PASSWORD_TOO_SHORT' })]),
    );
  });

  it('maps a weak password (no number) to PASSWORD_REQUIREMENTS', () => {
    const wrapped = z.object({ body: z.object({ password: passwordSchema }) });
    const result = wrapped.safeParse({ body: { password: 'abcdefghij' } });
    const errors = toApiErrors(result.error!);
    expect(errors.some((e) => e.field === 'password' && e.code === 'PASSWORD_REQUIREMENTS')).toBe(true);
  });

  it('enforces the idType/idNumber pair on the profile step', () => {
    const donorProfileSchema = z.object({
      body: z.object({
        idType: z.string().optional(),
        idNumber: z.string().optional(),
      }).superRefine((value, ctx) => {
        if (value.idNumber && !value.idType) {
          ctx.addIssue({
            code: 'custom',
            path: ['idType'],
            message: 'ID type is required when ID number is provided',
            params: { code: ErrorCodes.INVALID_ID_TYPE },
          });
        }
      }),
    });
    const result = donorProfileSchema.safeParse({ body: { idNumber: '3520212345678' } });
    const errors = toApiErrors(result.error!);
    expect(errors.some((e) => e.field === 'idType' && e.code === 'INVALID_ID_TYPE')).toBe(true);
  });

  it('builds a ValidationError carrying field-level errors', () => {
    const err = new ValidationError([{ field: 'email', code: 'INVALID_EMAIL', message: 'bad' }]);
    expect(err.statusCode).toBe(400);
    expect(err.errors).toHaveLength(1);
  });
});
