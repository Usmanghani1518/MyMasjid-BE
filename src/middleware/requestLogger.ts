import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '@/utils/helpers';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/;

const requestIdFrom = (req: Request): string => {
  const supplied = req.header('x-request-id');
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
};

const userIdFrom = (req: Request): string | undefined => {
  const user = (req as Request & { user?: { userId?: string } }).user;
  return user?.userId;
};

export const requestContext = (req: Request): Record<string, unknown> => ({
  requestId: req.requestId,
  method: req.method,
  path: req.path,
  userId: userIdFrom(req),
});

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  req.requestId = requestIdFrom(req);
  req.requestStartedAt = performance.now();
  res.setHeader('x-request-id', req.requestId);

  let logged = false;
  const logCompletion = (aborted: boolean): void => {
    if (logged) return;
    logged = true;

    const context = {
      ...requestContext(req),
      statusCode: res.statusCode,
      durationMs: Math.round((performance.now() - req.requestStartedAt) * 100) / 100,
      aborted,
    };

    if (aborted || res.statusCode >= 500) {
      logger.error(context, aborted ? 'Request aborted' : 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(context, 'Request completed with client error');
    } else {
      logger.info(context, 'Request completed');
    }
  };

  res.once('finish', () => logCompletion(false));
  res.once('close', () => {
    if (!res.writableFinished) logCompletion(true);
  });

  next();
};
