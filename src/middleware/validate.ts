import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateRequest =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors,
      });
      return;
    }

    next();
  };
