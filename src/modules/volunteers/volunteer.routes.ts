import { Router } from 'express';
import { asyncHandler } from '@/utils/helpers';
import { validateRequest } from '@/middleware/validate';
import { authenticateRegistration, AuthRequest } from '@/middleware/auth';
import { sendSuccess } from '@/utils/response';
import {
  volunteerProfileSkillsSchema,
  volunteerInterestsAvailabilitySchema,
} from '@/modules/volunteers/volunteer.schemas';
import * as volunteerService from '@/modules/volunteers/volunteer.service';

const router = Router();

const contextFrom = (req: AuthRequest) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});

// ==================== Step 2 — Profile & Skills ====================
router.post(
  '/profile-skills',
  authenticateRegistration,
  validateRequest(volunteerProfileSkillsSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const volunteer = await volunteerService.saveProfileSkills(req.user!.userId, req.body, {
      ...contextFrom(req),
      actorId: req.user!.userId,
    });
    sendSuccess(res, { volunteer }, 'Profile and skills saved');
  }),
);

// ==================== Step 3 — Interests & Availability ====================
router.post(
  '/interests-availability',
  authenticateRegistration,
  validateRequest(volunteerInterestsAvailabilitySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const volunteer = await volunteerService.saveInterestsAvailability(
      req.user!.userId,
      req.body,
      { ...contextFrom(req), actorId: req.user!.userId },
    );
    sendSuccess(res, { volunteer }, 'Interests and availability saved');
  }),
);

export default router;
