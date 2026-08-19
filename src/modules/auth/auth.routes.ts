import { Router } from 'express';
import { prisma } from '@/config/database';
import { asyncHandler, AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { validateRequest } from '@/middleware/validate';
import { authenticate, authenticateRegistration, AuthRequest } from '@/middleware/auth';
import { authLimiter, otpLimiter } from '@/middleware/rateLimit';
import { sendSuccess } from '@/utils/response';
import {
  loginSchema,
  refreshSchema,
  logoutSchema,
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
  completeSchema,
} from '@/modules/auth/auth.schemas';
import { login, refresh, logout } from '@/modules/auth/auth.service';
import * as donorService from '@/modules/donors/donor.service';
import * as volunteerService from '@/modules/volunteers/volunteer.service';
import * as masjidService from '@/modules/masjids/masjid.service';

const router = Router();

const contextFrom = (req: AuthRequest) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

// ==================== Registration (step 1 for all roles) ====================
// The account payload differs per role; the `role` field in the body selects
// the correct feature service. Each returns a short-lived registration token.
router.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const ctx = contextFrom(req);
    const role = req.body.role as string;

    if (role === 'DONOR') {
      const { registrationToken, donor } = await donorService.createAccount(req.body, ctx);
      sendSuccess(res, { registrationToken, donor }, 'Account created', 201);
      return;
    }
    if (role === 'VOLUNTEER') {
      const { registrationToken, volunteer } = await volunteerService.createAccount(req.body, ctx);
      sendSuccess(res, { registrationToken, volunteer }, 'Account created', 201);
      return;
    }
    const { registrationToken, masjid } = await masjidService.createInstitutionalIdentity(req.body, ctx);
    sendSuccess(res, { registrationToken, masjid }, 'Masjid registration started', 201);
  }),
);

// ==================== Email OTP (donor / volunteer) ====================
// The role + email come from the registration token, so the purpose is unambiguous.
const otpNotApplicable = () =>
  new AppError('Email OTP does not apply to this registration type', 400, true, ErrorCodes.OTP_INVALID);

router.post(
  '/send-otp',
  authenticateRegistration,
  otpLimiter,
  validateRequest(sendOtpSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const email = req.user!.email;
    const ctx = { ...contextFrom(req), actorId: userId };

    if (req.user!.role === 'DONOR') {
      await donorService.sendOtp(userId, email, ctx);
    } else if (req.user!.role === 'VOLUNTEER') {
      await volunteerService.sendOtp(userId, email, ctx);
    } else {
      throw otpNotApplicable();
    }
    sendSuccess(res, null, 'OTP sent');
  }),
);

router.post(
  '/verify-otp',
  authenticateRegistration,
  otpLimiter,
  validateRequest(verifyOtpSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const email = req.user!.email;
    const code = req.body.code as string;
    const ctx = { ...contextFrom(req), actorId: userId };

    if (req.user!.role === 'DONOR') {
      const donor = await donorService.verifyOtp(userId, email, code, ctx);
      sendSuccess(res, { donor }, 'Email verified');
      return;
    }
    if (req.user!.role === 'VOLUNTEER') {
      const volunteer = await volunteerService.verifyOtp(userId, email, code, ctx);
      sendSuccess(res, { volunteer }, 'Email verified');
      return;
    }
    throw otpNotApplicable();
  }),
);

// ==================== Complete (donor / volunteer) ====================
router.post(
  '/complete',
  authenticateRegistration,
  validateRequest(completeSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const ctx = { ...contextFrom(req), actorId: userId };

    if (req.user!.role === 'DONOR') {
      const { tokens, donor } = await donorService.complete(userId, ctx);
      sendSuccess(res, { ...tokens, donor }, 'Registration complete', 201);
      return;
    }
    if (req.user!.role === 'VOLUNTEER') {
      const { tokens, volunteer } = await volunteerService.complete(userId, ctx);
      sendSuccess(res, { ...tokens, volunteer }, 'Registration complete', 201);
      return;
    }
    throw new AppError(
      'Masjid registrations are submitted for review, not completed',
      400,
      true,
      ErrorCodes.REGISTRATION_STEP_INVALID,
    );
  }),
);

// ==================== Session ====================

router.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await login(req.body.email, req.body.password, contextFrom(req));
    sendSuccess(res, { user, ...tokens }, 'Login successful');
  }),
);

router.post(
  '/refresh',
  authLimiter,
  validateRequest(refreshSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await refresh(req.body.refreshToken, contextFrom(req));
    sendSuccess(res, { user, ...tokens }, 'Tokens refreshed');
  }),
);

router.post(
  '/logout',
  authLimiter,
  validateRequest(logoutSchema),
  asyncHandler(async (req, res) => {
    await logout(req.body.refreshToken, contextFrom(req));
    sendSuccess(res, null, 'Logged out');
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    if (!user || user.isActive === false) {
      throw new AppError('Account not found', 404, true, ErrorCodes.NOT_FOUND);
    }
    sendSuccess(res, { user }, 'Current user');
  }),
);

export default router;
