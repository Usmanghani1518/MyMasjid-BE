import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@/generated/prisma/client';
import { AppError, logger } from '@/utils/helpers';
import { ValidationError } from '@/utils/validation';
import { errorBody, ApiError } from '@/utils/response';
import { ErrorCodes } from '@/utils/errorCodes';
import { requestContext } from '@/middleware/requestLogger';

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

const frontendCode = (code: string): string => {
  switch (code) {
    case ErrorCodes.OTP_INVALID:
      return ErrorCodes.INVALID_OTP;
    case ErrorCodes.OTP_EXPIRED:
      return ErrorCodes.EXPIRED_OTP;
    case ErrorCodes.OTP_COOLDOWN:
    case ErrorCodes.OTP_LOCKED:
    case ErrorCodes.OTP_MAX_RESENDS:
    case ErrorCodes.RATE_LIMITED:
      return ErrorCodes.OTP_RATE_LIMITED;
    case ErrorCodes.INTERNAL_SERVER_ERROR:
      return ErrorCodes.SERVER_ERROR;
    default:
      return code;
  }
};

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const context = requestContext(req);
  const respond = (status: number, body: ReturnType<typeof errorBody>): void => {
    res.status(status).json({
      ...body,
      error: { ...body.error, requestId: req.requestId },
    });
  };

  if (err instanceof ValidationError) {
    logger.warn({ ...context, err, statusCode: err.statusCode }, 'Request validation failed');
    respond(err.statusCode, errorBody(err.message, err.errors));
    return;
  }

  if (err instanceof AppError) {
    const extra = (err as AppError & { extra?: Record<string, unknown> }).extra ?? {};
    const code = frontendCode(err.code ?? ErrorCodes.INTERNAL_SERVER_ERROR);
    const details = { ...context, err, statusCode: err.statusCode, errorCode: code };
    if (err.statusCode >= 500) logger.error(details, 'Application error');
    else logger.warn(details, 'Application error');
    respond(err.statusCode, errorBody(err.message, [{ code, message: err.message }], extra));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    const details = {
      ...context,
      err,
      statusCode: mapped.status,
      prismaCode: err.code,
    };
    if (mapped.status >= 500) logger.error(details, 'Database request failed');
    else logger.warn(details, 'Database request failed');
    respond(mapped.status, errorBody(mapped.errors[0].message, mapped.errors));
    return;
  }

  logger.error({ ...context, err, statusCode: 500 }, 'Unhandled request error');
  respond(
    500,
    errorBody('Internal server error', [
      { code: ErrorCodes.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
    ]),
  );
};
