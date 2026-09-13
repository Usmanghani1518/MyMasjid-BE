import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

const errorSchema = z.object({
  success: z.literal(false), message: z.string(), data: z.null(),
  errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })),
}).openapi('CampaignErrorResponse');

const galleryItemSchema = z.object({ url: z.string().url(), publicId: z.string().optional() }).openapi('CampaignGalleryItem');
const tierSchema = z.object({ id: z.string(), amount: z.number().positive(), name: z.string(), description: z.string() }).openapi('CampaignDonationTier');
const faqSchema = z.object({ id: z.string(), question: z.string(), answer: z.string() }).openapi('CampaignFaq');

const campaignWriteSchema = z.object({
  name: z.string().max(150).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  project: z.string().max(150).nullable().optional().describe('Temporary plain-text project name; replace with projectId when the Project module exists.'),
  description: z.string().max(160).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  coverImagePublicId: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  videoPublicId: z.string().nullable().optional(),
  gallery: z.array(galleryItemSchema).max(5).optional(),
  goal: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional().default('GBP'),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  donationTiers: z.array(tierSchema).max(20).optional(),
  story: z.string().max(50000).nullable().optional(),
  impact: z.string().max(120).nullable().optional(),
  faqs: z.array(faqSchema).max(30).optional(),
}).openapi('CampaignWriteRequest');

const campaignSchema = campaignWriteSchema.extend({
  id: z.string().uuid(), masjidId: z.string().uuid(),
  publicationStatus: z.enum(['DRAFT', 'PUBLISHED']),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED']),
  publishedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).openapi('Campaign');

const campaignResultSchema = z.object({ campaign: campaignSchema }).openapi('CampaignResult');
const securedErrors = {
  400: { description: 'Validation failure or incomplete campaign', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'Missing, expired, revoked, or stale access token', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'Only MASJID_ADMIN may access campaigns, and only for their own active Masjid', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Campaign not found in the authenticated admin’s Masjid', content: { 'application/json': { schema: errorSchema } } },
};
const jsonBody = { body: { content: { 'application/json': { schema: campaignWriteSchema } } } };
const idParams = z.object({ id: z.string().uuid() });

registry.registerPath({ method: 'post', path: '/masjid/campaigns/media', tags: ['Masjid Campaigns'], summary: 'Upload campaign media to Cloudinary', description: 'Accepts one image or MP4 file. The authenticated user must own an active Masjid.', security: [{ bearerAuth: [] }], request: { body: { content: { 'multipart/form-data': { schema: z.object({ file: z.instanceof(Buffer).openapi({ type: 'string', format: 'binary' }) }) } } } }, responses: { 201: { description: 'Cloudinary upload details', content: { 'application/json': { schema: z.object({ url: z.string().url(), publicId: z.string(), resourceType: z.string() }) } } }, ...securedErrors, 413: { description: 'File exceeds 25 MB' }, 503: { description: 'Cloudinary environment variables are not configured', content: { 'application/json': { schema: errorSchema } } } } });

registry.registerPath({ method: 'post', path: '/masjid/campaigns', tags: ['Masjid Campaigns'], summary: 'Create an incomplete or complete campaign draft', description: 'Draft creation intentionally permits omitted fields. Publish performs the complete validation.', security: [{ bearerAuth: [] }], request: jsonBody, responses: { 201: { description: 'Draft created', content: { 'application/json': { schema: campaignResultSchema } } }, ...securedErrors } });
registry.registerPath({ method: 'get', path: '/masjid/campaigns', tags: ['Masjid Campaigns'], summary: 'List campaigns belonging to the authenticated Masjid', security: [{ bearerAuth: [] }], request: { query: z.object({ search: z.string().optional(), status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED']).optional(), category: z.string().optional(), startDate: z.string().date().optional(), endDate: z.string().date().optional(), page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }) }, responses: { 200: { description: 'Campaign list and pagination', content: { 'application/json': { schema: z.object({ items: z.array(campaignSchema), pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() }) }) } } }, ...securedErrors } });
registry.registerPath({ method: 'get', path: '/masjid/campaigns/calendar', tags: ['Masjid Campaigns'], summary: 'Get dated campaigns as calendar events', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Campaign calendar events', content: { 'application/json': { schema: z.object({ events: z.array(z.object({ id: z.string().uuid(), title: z.string(), start: z.string().datetime(), end: z.string().datetime(), status: z.string(), campaign: campaignSchema })) }) } } }, ...securedErrors } });
registry.registerPath({ method: 'get', path: '/masjid/campaigns/analytics', tags: ['Masjid Campaigns'], summary: 'Get currently available campaign counts', description: 'Donation, donor, conversion, and traffic metrics are intentionally omitted until the donation feature exists.', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Counts by campaign lifecycle status', content: { 'application/json': { schema: z.object({ totalCampaigns: z.number(), draftCampaigns: z.number(), scheduledCampaigns: z.number(), activeCampaigns: z.number(), completedCampaigns: z.number() }) } } }, ...securedErrors } });
registry.registerPath({ method: 'get', path: '/masjid/campaigns/{id}', tags: ['Masjid Campaigns'], summary: 'Get one owned campaign', security: [{ bearerAuth: [] }], request: { params: idParams }, responses: { 200: { description: 'Campaign retrieved', content: { 'application/json': { schema: campaignResultSchema } } }, ...securedErrors } });
registry.registerPath({ method: 'patch', path: '/masjid/campaigns/{id}', tags: ['Masjid Campaigns'], summary: 'Partially update an owned campaign draft or campaign', security: [{ bearerAuth: [] }], request: { params: idParams, ...jsonBody }, responses: { 200: { description: 'Campaign saved', content: { 'application/json': { schema: campaignResultSchema } } }, ...securedErrors } });
registry.registerPath({ method: 'post', path: '/masjid/campaigns/{id}/publish', tags: ['Masjid Campaigns'], summary: 'Publish a complete campaign', description: 'Requires all frontend campaign fields, at least one donation tier, valid FAQs, and an end date after the start date.', security: [{ bearerAuth: [] }], request: { params: idParams }, responses: { 200: { description: 'Campaign published', content: { 'application/json': { schema: campaignResultSchema } } }, ...securedErrors } });
registry.registerPath({ method: 'delete', path: '/masjid/campaigns/{id}', tags: ['Masjid Campaigns'], summary: 'Soft-delete an owned campaign', security: [{ bearerAuth: [] }], request: { params: idParams }, responses: { 200: { description: 'Campaign deleted' }, ...securedErrors } });
