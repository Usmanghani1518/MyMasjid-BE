import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { verifyAccessToken, TokenPayload } from '@/services/token.service';
import { prisma } from '@/config/database';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
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

const attachUser = (req: AuthRequest, payload: TokenPayload): void => {
  req.user = {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
  };
};


export const authenticate = async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractBearerToken(req);
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, role: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new AppError('Authentication required', 401, true, ErrorCodes.UNAUTHORIZED);
    }
    if (user.email !== payload.email || user.role !== payload.role) {
      throw new AppError('Token permissions are no longer valid', 401, true, ErrorCodes.TOKEN_INVALID);
    }
    attachUser(req, payload);
    next();
  } catch (err) {
    next(err);
  }
};


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
