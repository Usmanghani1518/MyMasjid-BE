import { Router } from 'express';
import { prisma } from '@/config/database';
import { asyncHandler, AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { validateRequest } from '@/middleware/validate';
import { authenticate, AuthRequest } from '@/middleware/auth';
import { authLimiter, otpLimiter } from '@/middleware/rateLimit';
import { sendSuccess } from '@/utils/response';
import {
  donorStartSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  masjidRegisterSchema,
  refreshSchema,
  resendPasswordOtpSchema,
  resendRegistrationOtpSchema,
  resetPasswordSchema,
  verifyPasswordOtpSchema,
  verifyRegistrationOtpSchema,
  volunteerStartSchema,
} from '@/modules/auth/auth.schemas';
import {
  forgotPassword,
  login,
  logout,
  refresh,
  registerMasjid,
  resendPasswordOtp,
  resendRegistrationOtp,
  resetPassword,
  startDonorRegistration,
  startVolunteerRegistration,
  verifyPasswordOtp,
  verifyRegistrationOtp,
} from '@/modules/auth/auth.service';

const router = Router();

const contextFrom = (req: AuthRequest) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

router.post(
  '/register/donor/start',
  otpLimiter,
  validateRequest(donorStartSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await startDonorRegistration(req.body, contextFrom(req)), 'OTP sent.', 201);
  }),
);

router.post(
  '/register/donor/verify-otp',
  otpLimiter,
  validateRequest(verifyRegistrationOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verifyRegistrationOtp(req.body.pendingRegistrationId, req.body.otp, 'donor', contextFrom(req)), 'Registration complete.');
  }),
);

router.post(
  '/register/donor/resend-otp',
  otpLimiter,
  validateRequest(resendRegistrationOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await resendRegistrationOtp(req.body.pendingRegistrationId, 'donor', contextFrom(req)), 'OTP sent.');
  }),
);

router.post(
  '/register/volunteer/start',
  otpLimiter,
  validateRequest(volunteerStartSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await startVolunteerRegistration(req.body, contextFrom(req)), 'OTP sent.', 201);
  }),
);

router.post(
  '/register/volunteer/verify-otp',
  otpLimiter,
  validateRequest(verifyRegistrationOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verifyRegistrationOtp(req.body.pendingRegistrationId, req.body.otp, 'volunteer', contextFrom(req)), 'Registration complete.');
  }),
);

router.post(
  '/register/volunteer/resend-otp',
  otpLimiter,
  validateRequest(resendRegistrationOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await resendRegistrationOtp(req.body.pendingRegistrationId, 'volunteer', contextFrom(req)), 'OTP sent.');
  }),
);

router.post(
  '/register/masjid',
  validateRequest(masjidRegisterSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await registerMasjid(req.body), 'Masjid application submitted.', 201);
  }),
);

router.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await login(req.body.email, req.body.password, contextFrom(req));
    sendSuccess(res, { user, tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: 3600, tokenType: 'Bearer' } }, 'Login successful.');
  }),
);

router.post(
  '/password/forgot',
  otpLimiter,
  validateRequest(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await forgotPassword(req.body.email, contextFrom(req)), 'OTP sent.');
  }),
);

router.post(
  '/password/verify-otp',
  otpLimiter,
  validateRequest(verifyPasswordOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verifyPasswordOtp(req.body.passwordResetId, req.body.otp, contextFrom(req)), 'OTP verified.');
  }),
);

router.post(
  '/password/reset',
  validateRequest(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await resetPassword(req.body.passwordResetId, req.body.resetAuthorizationToken, req.body.password), 'Password reset.');
  }),
);

router.post(
  '/password/resend-otp',
  otpLimiter,
  validateRequest(resendPasswordOtpSchema),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await resendPasswordOtp(req.body.passwordResetId, contextFrom(req)), 'OTP sent.');
  }),
);

router.post(
  '/refresh',
  authLimiter,
  validateRequest(refreshSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await refresh(req.body.refreshToken, contextFrom(req));
    sendSuccess(res, { user, tokens }, 'Tokens refreshed');
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
