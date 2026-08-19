import { rateLimit, Options } from 'express-rate-limit';
import { errorBodyFromCode } from '@/utils/response';
import { ErrorCodes } from '@/utils/errorCodes';

/** Rate limiter factory that responds in the standard API envelope. */
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

/** OTP endpoints: strict limit to blunt brute force / abuse. */
export const otpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

/** File upload endpoints: bounded per-hour rate. */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 50,
});

/** Auth endpoints (login / refresh): guards against credential stuffing. */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});
