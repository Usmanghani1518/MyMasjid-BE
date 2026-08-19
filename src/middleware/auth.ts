import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import {
  verifyAccessToken,
  verifyRegistrationToken,
  TokenPayload,
} from '@/services/token.service';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  /** True when authenticated with a short-lived registration token. */
  isRegistration: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const extractBearerToken = (req: Request): string => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
  }
  return token;
};

const attachUser = (req: AuthRequest, payload: TokenPayload, isRegistration: boolean): void => {
  req.user = {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    isRegistration,
  };
};

/** Requires a full access token (post-completion / post-login sessions). */
export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  try {
    const token = extractBearerToken(req);
    const payload = verifyAccessToken(token);
    attachUser(req, payload, false);
    next();
  } catch (err) {
    next(err);
  }
};

/** Requires a short-lived registration token (issued at registration step 1). */
export const authenticateRegistration = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  try {
    const token = extractBearerToken(req);
    const payload = verifyRegistrationToken(token);
    attachUser(req, payload, true);
    next();
  } catch (err) {
    next(err);
  }
};

/** Accepts either an access token or a registration token (e.g. document uploads). */
export const authenticateEither = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = extractBearerToken(req);
    try {
      attachUser(req, verifyAccessToken(token), false);
      next();
      return;
    } catch {
      attachUser(req, verifyRegistrationToken(token), true);
      next();
    }
  } catch (err) {
    next(err);
  }
};

/** Role guard — must run after `authenticate`. */
export const requireRoles =
  (...roles: string[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('Insufficient permissions', 403, true, ErrorCodes.FORBIDDEN));
      return;
    }
    next();
  };
