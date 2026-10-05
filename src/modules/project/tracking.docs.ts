import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';
import { milestoneMutationBody, milestoneStatuses } from './milestone.schemas';
import { constructionMutationBody } from './construction.schemas';
import { budgetMutationBody } from './budget.schemas';

extendZodWithOpenApi(z);

const dataSchema = z.object({}).passthrough().openapi({ type: 'object' });
const successSchema = z.object({ success: z.literal(true), message: z.string(), data: dataSchema.nullable(), errors: z.array(z.unknown()) }).openapi('ProjectTrackerSuccess');
const errorSchema = z.object({ success: z.literal(false), message: z.string(), data: z.null(), errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })) }).openapi('ProjectTrackerError');
const securedErrors = {
  400: { description: 'Validation failure', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'Authentication required', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'An active Masjid owned by the MASJID_ADMIN is required', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Project or nested resource not found in the authenticated Masjid', content: { 'application/json': { schema: errorSchema } } },
  409: { description: 'Duplicate invoice number or forecast month', content: { 'application/json': { schema: errorSchema } } },
};
const projectParams = z.object({ projectId: z.uuid() });
const jsonBody = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } });
const response = (description: string) => ({ 200: { description, content: { 'application/json': { schema: successSchema } } }, ...securedErrors });

registry.registerPath({
  method: 'get', path: '/masjid/projects/dashboard', tags: ['Masjid Projects'], summary: 'Get the combined projects dashboard',
  description: 'One dashboard response containing project status counts, aggregate funding, milestone counts, recent projects, and upcoming milestones.',
  security: [{ bearerAuth: [] }], responses: response('Combined projects dashboard'),
});

registry.registerPath({
  method: 'post', path: '/masjid/projects/{projectId}/files', tags: ['Masjid Projects'], summary: 'Upload a project file',
  description: 'Generic project-scoped upload for cover images, renders, site/gallery media, videos, compliance documents, receipts, contractor reports, and milestone evidence. Maximum size is 50 MB.',
  security: [{ bearerAuth: [] }],
  request: {
    params: projectParams,
    body: { content: { 'multipart/form-data': { schema: z.object({
      file: z.instanceof(Buffer).openapi({ type: 'string', format: 'binary' }),
      purpose: z.enum(['COVER_IMAGE', 'ARCHITECTURAL_RENDER', 'SITE_PHOTO', 'GALLERY', 'VIDEO', 'COMPLIANCE_DOCUMENT', 'RECEIPT', 'CONTRACTOR_REPORT', 'MILESTONE_EVIDENCE']),
    }) } } },
  },
  responses: {
    201: { description: 'Uploaded file URL and metadata', content: { 'application/json': { schema: successSchema } } },
    ...securedErrors,
    413: { description: 'File exceeds 50 MB' },
    503: { description: 'Cloudinary is not configured', content: { 'application/json': { schema: errorSchema } } },
  },
});

registry.registerPath({
  method: 'get', path: '/masjid/projects/{projectId}/milestones', tags: ['Masjid Projects'], summary: 'Get the milestone tracker for one project',
  description: 'Returns milestone summary counts and milestone records including their assets, complete comment threads, progress-update history, and per-milestone counts.',
  security: [{ bearerAuth: [] }], request: { params: projectParams, query: z.object({ status: z.enum(milestoneStatuses).optional(), page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }) },
  responses: response('Project milestone tracker'),
});
registry.registerPath({
  method: 'patch', path: '/masjid/projects/{projectId}/milestones', tags: ['Masjid Projects'], summary: 'Mutate the milestone tracker',
  description: 'Single mutation endpoint for milestone CREATE/UPDATE/DELETE, progress-update CREATE, and comment CREATE/UPDATE/DELETE. Select the operation with resource and action.',
  security: [{ bearerAuth: [] }], request: { params: projectParams, ...jsonBody(milestoneMutationBody) }, responses: response('Milestone tracker mutation result'),
});

registry.registerPath({
  method: 'get', path: '/masjid/projects/{projectId}/construction', tags: ['Masjid Projects'], summary: 'Get the construction tracker for one project',
  description: 'Returns all project construction progress data previously exposed by separate reads: shared milestone phases with assets/comments/updates, every diary log with media, all gallery assets, all contractor reports, and section counts.',
  security: [{ bearerAuth: [] }], request: { params: projectParams }, responses: response('Project construction tracker'),
});
registry.registerPath({
  method: 'patch', path: '/masjid/projects/{projectId}/construction', tags: ['Masjid Projects'], summary: 'Mutate the construction tracker',
  description: 'Single mutation endpoint for construction log, gallery asset, and contractor report CREATE/UPDATE/DELETE operations.',
  security: [{ bearerAuth: [] }], request: { params: projectParams, ...jsonBody(constructionMutationBody) }, responses: response('Construction tracker mutation result'),
});

registry.registerPath({
  method: 'get', path: '/masjid/projects/{projectId}/budget', tags: ['Masjid Projects'], summary: 'Get the budget tracker for one project',
  description: 'Returns all budget tracker data previously exposed by separate reads: calculated totals, complete allocations, raw expenditures, expense mix, every monthly forecast with actual value, and all invoices with computed overdue state.',
  security: [{ bearerAuth: [] }], request: { params: projectParams }, responses: response('Project budget tracker'),
});
registry.registerPath({
  method: 'patch', path: '/masjid/projects/{projectId}/budget', tags: ['Masjid Projects'], summary: 'Mutate the budget tracker',
  description: 'Single mutation endpoint for allocation, expenditure, invoice, and forecast CREATE/UPDATE/DELETE operations.',
  security: [{ bearerAuth: [] }], request: { params: projectParams, ...jsonBody(budgetMutationBody) }, responses: response('Budget tracker mutation result'),
});
