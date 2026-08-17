import { Request, Response, NextFunction } from 'express';
import { AppError, logger } from '@/utils/helpers';
import { config } from '@/config';

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    status: 'error',
    message: config.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
};
