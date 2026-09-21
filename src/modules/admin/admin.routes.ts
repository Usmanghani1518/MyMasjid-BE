import { Router } from 'express';
import { asyncHandler } from '@/utils/helpers';
import { validateRequest } from '@/middleware/validate';
import { authenticate, requireRoles, AuthRequest } from '@/middleware/auth';
import { sendSuccess } from '@/utils/response';
import {
  listApplicationsSchema,
  applicationParamsSchema,
  denyApplicationSchema,
  approveApplicationSchema,
} from '@/modules/admin/admin.schemas';
import * as adminService from '@/modules/admin/admin.service';

const router = Router();

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

const adminContext = (req: AuthRequest) => ({
  actorId: req.user!.userId,
  actorEmail: req.user!.email,
  actorRole: req.user!.role,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});


router.get(
  '/applications',
  authenticate,
  requireRoles(...ADMIN_ROLES),
  validateRequest(listApplicationsSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await adminService.listApplications(req.query, adminContext(req));
    sendSuccess(res, result, 'Applications retrieved');
  }),
);


router.get(
  '/applications/:id',
  authenticate,
  requireRoles(...ADMIN_ROLES),
  validateRequest(applicationParamsSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const application = await adminService.getApplication(String(req.params.id), adminContext(req));
    sendSuccess(res, { application }, 'Application retrieved');
  }),
);


router.post(
  '/applications/:id/approve',
  authenticate,
  requireRoles(...ADMIN_ROLES),
  validateRequest(approveApplicationSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const application = await adminService.approveApplication(String(req.params.id), adminContext(req));
    sendSuccess(res, { application }, 'Application approved');
  }),
);


router.post(
  '/applications/:id/deny',
  authenticate,
  requireRoles(...ADMIN_ROLES),
  validateRequest(denyApplicationSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const application = await adminService.denyApplication(String(req.params.id), adminContext(req), {
      reasons: req.body.reasons,
      note: req.body.note,
    });
    sendSuccess(res, { application }, 'Application denied');
  }),
);

export default router;
