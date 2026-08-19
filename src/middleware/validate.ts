import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { toApiErrors, ValidationError } from '@/utils/validation';

/**
 * Zod request validation middleware.
 * On failure it forwards a ValidationError to the error handler, which renders
 * `{ success: false, message, data: null, errors: [{ field, code, message }] }` with HTTP 400.
 *
 * On success it writes the parsed body back onto the request, so handlers receive
 * coerced/transformed values (e.g. `dateOfBirth` as a Date, trimmed strings).
 * Query/params are left raw — pagination middleware coerces them itself.
 */
export const validateRequest =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      next(new ValidationError(toApiErrors(result.error)));
      return;
    }

    const parsed = result.data as { body?: unknown };
    if (parsed && 'body' in parsed) {
      req.body = parsed.body;
    }

    next();
  };
