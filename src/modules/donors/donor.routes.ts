import { Router } from 'express';
import { asyncHandler } from '@/utils/helpers';
import { validateRequest } from '@/middleware/validate';
import { authenticateRegistration, AuthRequest } from '@/middleware/auth';
import { sendSuccess } from '@/utils/response';
import { donorProfileSchema, donorInterestsSchema } from '@/modules/donors/donor.schemas';
import * as donorService from '@/modules/donors/donor.service';

const router = Router();

const contextFrom = (req: AuthRequest) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

// ==================== Step 2 — Profile ====================
router.post(
  '/profile',
  authenticateRegistration,
  validateRequest(donorProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const donor = await donorService.saveProfile(req.user!.userId, req.body, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { donor }, 'Profile saved');
  }),
);

// ==================== Step 3 — Interests ====================
router.post(
  '/interests',
  authenticateRegistration,
  validateRequest(donorInterestsSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const donor = await donorService.saveInterests(
      req.user!.userId,
      req.body.interests,
      { ...contextFrom(req), actorId: req.user!.userId },
    );
    sendSuccess(res, { donor }, 'Interests saved');
  }),
);

export default router;
