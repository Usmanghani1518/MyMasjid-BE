import { rateLimit, Options } from 'express-rate-limit';
import { errorBodyFromCode } from '@/utils/response';
import { ErrorCodes } from '@/utils/errorCodes';

export const createRateLimiter = (options: Partial<Options>) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    handler: (req, res) => {
      res.status(429).json(errorBodyFromCode(ErrorCodes.RATE_LIMITED, 'Too many requests, please try again later.'));
    },
  });

export const otpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 50,
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});
