import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@/generated/prisma/client';
import { AppError, logger } from '@/utils/helpers';
import { ValidationError } from '@/utils/validation';
import { errorBody, ApiError } from '@/utils/response';
import { ErrorCodes } from '@/utils/errorCodes';

/**
 * Prisma error → (status, code, message) mapping.
 * Only well-known errors are surfaced; everything else stays generic.
 */
const mapPrismaError = (
  err: Prisma.PrismaClientKnownRequestError,
): { status: number; errors: ApiError[] } => {
  switch (err.code) {
    case 'P2002':
      return {
        status: 409,
        errors: [
          {
            field: 'email',
            code: ErrorCodes.EMAIL_ALREADY_EXISTS,
            message: 'An account with this email already exists',
          },
        ],
      };
    case 'P2025':
      return {
        status: 404,
        errors: [{ code: ErrorCodes.NOT_FOUND, message: 'Resource not found' }],
      };
    case 'P2003':
      return {
        status: 400,
        errors: [{ code: ErrorCodes.INVALID_VALUE, message: 'Invalid related record reference' }],
      };
    default:
      logger.warn({ code: err.code }, 'Unhandled Prisma error code');
      return {
        status: 500,
        errors: [{ code: ErrorCodes.INTERNAL_SERVER_ERROR, message: 'Internal server error' }],
      };
  }
};

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // ==================== Known application errors ====================
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json(errorBody(err.message, err.errors));
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(errorBody(err.message, [{ code: err.code ?? ErrorCodes.INTERNAL_SERVER_ERROR, message: err.message }]));
    return;
  }

  // ==================== Prisma known errors ====================
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    res.status(mapped.status).json(errorBody(mapped.errors[0].message, mapped.errors));
    return;
  }

  // ==================== Unknown errors ====================
  logger.error({ err }, 'Unhandled error');
  res.status(500).json(errorBody('Internal server error', [{ code: ErrorCodes.INTERNAL_SERVER_ERROR, message: 'Internal server error' }]));
};
