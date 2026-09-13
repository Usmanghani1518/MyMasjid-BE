import { Router } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest, requireRoles } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validate';
import { asyncHandler, AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { sendSuccess } from '@/utils/response';
import { uploadCampaignMedia } from '@/services/cloudinary.service';
import { createCampaignSchema, updateCampaignSchema, campaignParamsSchema, listCampaignsSchema } from './campaign.schemas';
import * as service from './campaign.service';

const router = Router();
router.use(authenticate, requireRoles('MASJID_ADMIN'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = file.mimetype.startsWith('image/') || file.mimetype === 'video/mp4';
    if (!allowed) return callback(new AppError('Only images and MP4 videos are allowed', 400, true, ErrorCodes.FILE_TYPE_NOT_ALLOWED));
    callback(null, true);
  },
});

router.post('/media', upload.single('file'), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) throw new AppError('Media file is required', 400, true, ErrorCodes.FILE_REQUIRED);
  await service.ensureMasjidOwner(req.user!.userId);
  const result = await uploadCampaignMedia(req.file.buffer, req.file.mimetype);
  sendSuccess(res, { url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type }, 'Media uploaded', 201);
}));

router.get('/', validateRequest(listCampaignsSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await service.listCampaigns(req.user!.userId, req.query), 'Campaigns retrieved');
}));
router.get('/calendar', asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { events: await service.calendar(req.user!.userId) }, 'Campaign calendar retrieved');
}));
router.get('/analytics', asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, await service.analytics(req.user!.userId), 'Campaign analytics retrieved');
}));
router.post('/', validateRequest(createCampaignSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { campaign: await service.createCampaign(req.user!.userId, req.body) }, 'Campaign draft created', 201);
}));
router.get('/:id', validateRequest(campaignParamsSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { campaign: await service.getCampaign(req.user!.userId, String(req.params.id)) }, 'Campaign retrieved');
}));
router.patch('/:id', validateRequest(updateCampaignSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { campaign: await service.updateCampaign(req.user!.userId, String(req.params.id), req.body) }, 'Campaign saved');
}));
router.post('/:id/publish', validateRequest(campaignParamsSchema), asyncHandler(async (req: AuthRequest, res) => {
  sendSuccess(res, { campaign: await service.publishCampaign(req.user!.userId, String(req.params.id)) }, 'Campaign published');
}));
router.delete('/:id', validateRequest(campaignParamsSchema), asyncHandler(async (req: AuthRequest, res) => {
  await service.deleteCampaign(req.user!.userId, String(req.params.id));
  sendSuccess(res, null, 'Campaign deleted');
}));

export default router;
