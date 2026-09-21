import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { toApiErrors, ValidationError } from '@/utils/validation';










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
