import { Router } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest, requireRoles } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validate';
import { asyncHandler, AppError } from '@/utils/helpers';
import { sendSuccess } from '@/utils/response';
import * as milestone from './milestone.service';
import * as construction from './construction.service';
import * as budget from './budget.service';
import * as dashboard from './dashboard.service';
import { listMilestonesSchema, mutateMilestonesSchema } from './milestone.schemas';
import { constructionOverviewSchema, mutateConstructionSchema } from './construction.schemas';
import { budgetOverviewSchema, mutateBudgetSchema } from './budget.schemas';
import { ErrorCodes } from '@/utils/errorCodes';
import { uploadProjectFile } from '@/services/cloudinary.service';
import { getOwnedProjectRecord } from './project.service';

const router = Router();
router.use(authenticate, requireRoles('MASJID_ADMIN'));
const actor = (req: AuthRequest) => ({ id: req.user!.userId, name: req.user!.email });
const deleted = (id: string) => ({ id, deleted: true });
const projectFilePurposes = new Set([
  'COVER_IMAGE', 'ARCHITECTURAL_RENDER', 'SITE_PHOTO', 'GALLERY', 'VIDEO',
  'COMPLIANCE_DOCUMENT', 'RECEIPT', 'CONTRACTOR_REPORT', 'MILESTONE_EVIDENCE',
]);
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf'].includes(file.mimetype);
    if (!allowed) return callback(new AppError('Only JPG, PNG, WebP, MP4, MOV, and PDF files are allowed', 400, true, ErrorCodes.FILE_TYPE_NOT_ALLOWED));
    callback(null, true);
  },
});

router.get('/dashboard', asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await dashboard.getProjectsDashboard(req.user!.userId), 'Projects dashboard retrieved');
}));

router.post('/:projectId/files', validateRequest(constructionOverviewSchema), fileUpload.single('file'), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) throw new AppError('Project file is required', 400, true, ErrorCodes.FILE_REQUIRED);
  const purpose = String(req.body.purpose ?? '').toUpperCase();
  if (!projectFilePurposes.has(purpose)) throw new AppError('A valid project file purpose is required', 400, true, ErrorCodes.INVALID_VALUE);
  const projectId = String(req.params.projectId);
  await getOwnedProjectRecord(req.user!.userId, projectId);
  const uploaded = await uploadProjectFile(req.file.buffer, req.file.mimetype, projectId, purpose);
  sendSuccess(res, {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    resourceType: uploaded.resource_type,
    purpose,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  }, 'Project file uploaded', 201);
}));

router.get('/:projectId/milestones', validateRequest(listMilestonesSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await milestone.listMilestones(req.user!.userId, String(req.params.projectId), req.query), 'Milestone tracker retrieved');
}));
router.patch('/:projectId/milestones', validateRequest(mutateMilestonesSchema), asyncHandler(async (req: AuthRequest, res) => {
  const projectId = String(req.params.projectId);
  const input = req.body;
  let result: unknown;
  if (input.resource === 'MILESTONE' && input.action === 'CREATE') result = await milestone.createMilestone(req.user!.userId, projectId, input.data);
  else if (input.resource === 'MILESTONE' && input.action === 'UPDATE') result = await milestone.updateMilestone(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'MILESTONE' && input.action === 'DELETE') { await milestone.deleteMilestone(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'UPDATE') result = await milestone.submitMilestoneUpdate(req.user!.userId, projectId, input.milestoneId, actor(req), input.data);
  else if (input.resource === 'COMMENT' && input.action === 'CREATE') result = await milestone.createComment(req.user!.userId, projectId, input.milestoneId, actor(req), input.data.body);
  else if (input.resource === 'COMMENT' && input.action === 'UPDATE') result = await milestone.updateComment(req.user!.userId, projectId, input.milestoneId, input.id, input.data.body);
  else { await milestone.deleteComment(req.user!.userId, projectId, input.milestoneId, input.id); result = deleted(input.id); }
  sendSuccess(res, { resource: input.resource, action: input.action, result }, 'Milestone tracker updated');
}));

router.get('/:projectId/construction', validateRequest(constructionOverviewSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await construction.getConstructionOverview(req.user!.userId, String(req.params.projectId)), 'Construction tracker retrieved');
}));
router.patch('/:projectId/construction', validateRequest(mutateConstructionSchema), asyncHandler(async (req: AuthRequest, res) => {
  const projectId = String(req.params.projectId);
  const input = req.body;
  let result: unknown;
  if (input.resource === 'LOG' && input.action === 'CREATE') result = await construction.createLog(req.user!.userId, projectId, actor(req), input.data);
  else if (input.resource === 'LOG' && input.action === 'UPDATE') result = await construction.updateLog(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'LOG' && input.action === 'DELETE') { await construction.deleteLog(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'ASSET' && input.action === 'CREATE') result = await construction.createAsset(req.user!.userId, projectId, input.data);
  else if (input.resource === 'ASSET' && input.action === 'UPDATE') result = await construction.updateAsset(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'ASSET' && input.action === 'DELETE') { await construction.deleteAsset(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'REPORT' && input.action === 'CREATE') result = await construction.createReport(req.user!.userId, projectId, input.data);
  else if (input.resource === 'REPORT' && input.action === 'UPDATE') result = await construction.updateReport(req.user!.userId, projectId, input.id, input.data);
  else { await construction.deleteReport(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  sendSuccess(res, { resource: input.resource, action: input.action, result }, 'Construction tracker updated');
}));

router.get('/:projectId/budget', validateRequest(budgetOverviewSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await budget.getBudgetOverview(req.user!.userId, String(req.params.projectId)), 'Budget tracker retrieved');
}));
router.patch('/:projectId/budget', validateRequest(mutateBudgetSchema), asyncHandler(async (req: AuthRequest, res) => {
  const projectId = String(req.params.projectId);
  const input = req.body;
  let result: unknown;
  if (input.resource === 'ALLOCATION' && input.action === 'CREATE') result = await budget.createAllocation(req.user!.userId, projectId, input.data);
  else if (input.resource === 'ALLOCATION' && input.action === 'UPDATE') result = await budget.updateAllocation(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'ALLOCATION' && input.action === 'DELETE') { await budget.deleteAllocation(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'EXPENDITURE' && input.action === 'CREATE') result = await budget.createExpenditure(req.user!.userId, projectId, input.data);
  else if (input.resource === 'EXPENDITURE' && input.action === 'UPDATE') result = await budget.updateExpenditure(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'EXPENDITURE' && input.action === 'DELETE') { await budget.deleteExpenditure(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'INVOICE' && input.action === 'CREATE') result = await budget.createInvoice(req.user!.userId, projectId, input.data);
  else if (input.resource === 'INVOICE' && input.action === 'UPDATE') result = await budget.updateInvoice(req.user!.userId, projectId, input.id, input.data);
  else if (input.resource === 'INVOICE' && input.action === 'DELETE') { await budget.deleteInvoice(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  else if (input.resource === 'FORECAST' && input.action === 'CREATE') result = await budget.createForecast(req.user!.userId, projectId, input.data);
  else if (input.resource === 'FORECAST' && input.action === 'UPDATE') result = await budget.updateForecast(req.user!.userId, projectId, input.id, input.data);
  else { await budget.deleteForecast(req.user!.userId, projectId, input.id); result = deleted(input.id); }
  sendSuccess(res, { resource: input.resource, action: input.action, result }, 'Budget tracker updated');
}));

export default router;
