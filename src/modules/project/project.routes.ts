import { Router } from 'express';
import { authenticate, AuthRequest, requireRoles } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validate';
import { asyncHandler } from '@/utils/helpers';
import { sendSuccess } from '@/utils/response';
import { audit, AuditActions } from '@/services/audit.service';
import { createProjectSchema, listProjectsSchema, projectParamsSchema, updateProjectSchema } from './project.schemas';
import * as service from './project.service';

const router = Router();
router.use(authenticate, requireRoles('MASJID_ADMIN'));

router.get('/', validateRequest(listProjectsSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await service.listProjects(req.user!.userId, req.query), 'Projects retrieved');
}));

router.get('/summary', asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await service.getProjectSummary(req.user!.userId), 'Project summary retrieved');
}));

router.post('/', validateRequest(createProjectSchema), asyncHandler(async (req: AuthRequest, res) => {
  const project = await service.createProject(req.user!.userId, req.body);
  await audit({ actorId: req.user!.userId, actorEmail: req.user!.email, actorRole: req.user!.role, action: AuditActions.PROJECT_CREATED, entityType: 'Project', entityId: project.id });
  sendSuccess(res, { project }, 'Project created', 201);
}));

router.get('/:id', validateRequest(projectParamsSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { project: await service.getProject(req.user!.userId, String(req.params.id)) }, 'Project retrieved');
}));

router.patch('/:id', validateRequest(updateProjectSchema), asyncHandler(async (req: AuthRequest, res) => {
  const project = await service.updateProject(req.user!.userId, String(req.params.id), req.body);
  await audit({ actorId: req.user!.userId, actorEmail: req.user!.email, actorRole: req.user!.role, action: AuditActions.PROJECT_UPDATED, entityType: 'Project', entityId: project.id });
  sendSuccess(res, { project }, 'Project updated');
}));

router.delete('/:id', validateRequest(projectParamsSchema), asyncHandler(async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  await service.deleteProject(req.user!.userId, id);
  await audit({ actorId: req.user!.userId, actorEmail: req.user!.email, actorRole: req.user!.role, action: AuditActions.PROJECT_DELETED, entityType: 'Project', entityId: id });
  sendSuccess(res, { project: { id, deleted: true } }, 'Project deleted');
}));

export default router;
