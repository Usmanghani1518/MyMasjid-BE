import { Router } from 'express';
import { asyncHandler } from '@/utils/helpers';
import { validateRequest } from '@/middleware/validate';
import { authenticateRegistration, AuthRequest } from '@/middleware/auth';
import { sendSuccess } from '@/utils/response';
import {
  masjidOrganizationProfileSchema,
  masjidServicesComplianceSchema,
  masjidTrusteesSchema,
  masjidSubmitSchema,
  masjidResubmitSchema,
} from '@/modules/masjids/masjid.schemas';
import * as masjidService from '@/modules/masjids/masjid.service';

const router = Router();

const contextFrom = (req: AuthRequest) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

// Note: Step 1 (institutional identity / account creation) lives in the auth
// module at POST /auth/register with role: 'MASJID'.

// ==================== Step 2 — Organization Profile ====================
router.post(
  '/organization-profile',
  authenticateRegistration,
  validateRequest(masjidOrganizationProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.saveOrganizationProfile(req.user!.userId, req.body, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { masjid }, 'Organization profile saved');
  }),
);

// ==================== Step 3 — Services & Compliance ====================
router.post(
  '/services-compliance',
  authenticateRegistration,
  validateRequest(masjidServicesComplianceSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.saveServicesCompliance(req.user!.userId, req.body, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { masjid }, 'Services and compliance saved');
  }),
);

// ==================== Step 4a — Trustees ====================
router.post(
  '/trustees',
  authenticateRegistration,
  validateRequest(masjidTrusteesSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.replaceTrustees(req.user!.userId, req.body.trustees, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { masjid }, 'Trustees saved');
  }),
);

// ==================== Draft status ====================
router.get(
  '/me',
  authenticateRegistration,
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.getDraft(req.user!.userId);
    sendSuccess(res, { masjid }, 'Current registration draft');
  }),
);

// ==================== Step 5 — Submit for Review ====================
router.post(
  '/submit',
  authenticateRegistration,
  validateRequest(masjidSubmitSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.submitForReview(req.user!.userId, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { masjid }, 'Application submitted for review');
  }),
);

// ==================== Resubmit a denied application ====================
router.post(
  '/resubmit',
  authenticateRegistration,
  validateRequest(masjidResubmitSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const masjid = await masjidService.resubmit(req.user!.userId, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { masjid }, 'Application reopened for editing');
  }),
);

export default router;
