import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

const apiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.nullable(z.unknown()),
    errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })),
  })
  .openapi('ApiErrorResponse');

const applicationSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    city: z.string().nullable(),
    country: z.string(),
    organizationType: z.string().nullable(),
    status: z.string(),
    submittedAt: z.string().datetime().nullable(),
    contactEmail: z.string().nullable(),
    owner: z.object({ id: z.string().uuid(), email: z.string().email(), name: z.string().nullable() }),
    trusteeCount: z.number(),
    documentCount: z.number(),
  })
  .openapi('ApplicationSummary');

const listResponseSchema = z
  .object({
    items: z.array(applicationSummarySchema),
    meta: z.object({ page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number() }),
  })
  .openapi('ApplicationListResponse');

const denialReasonSchema = z
  .object({ field: z.string().optional(), code: z.string(), message: z.string() })
  .openapi('DenialReason');

const denyRequestSchema = z
  .object({ reasons: z.array(denialReasonSchema).min(1), note: z.string().optional() })
  .openapi('DenyApplicationRequest');

registry.registerPath({
  method: 'get',
  path: '/admin/compliance/applications',
  tags: ['Admin / Compliance'],
  summary: 'List masjid applications (filterable, paginated, sortable)',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.enum(['PENDING_REVIEW', 'APPROVED', 'DENIED', 'DRAFT']).optional(),
      search: z.string().optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
  },
  responses: {
    200: { description: 'Paginated applications', content: { 'application/json': { schema: listResponseSchema } } },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
    403: { description: 'Forbidden (not admin)', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/compliance/applications/{id}',
  tags: ['Admin / Compliance'],
  summary: 'View a masjid application in full detail',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Application detail' },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
    403: { description: 'Forbidden (not admin)', content: { 'application/json': { schema: apiErrorSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/compliance/applications/{id}/approve',
  tags: ['Admin / Compliance'],
  summary: 'Approve a pending masjid application',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Application approved' },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
    403: { description: 'Forbidden (not admin)', content: { 'application/json': { schema: apiErrorSchema } } },
    409: { description: 'Application not pending', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/compliance/applications/{id}/deny',
  tags: ['Admin / Compliance'],
  summary: 'Deny a pending masjid application with structured reasons',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: denyRequestSchema } } },
  },
  responses: {
    200: { description: 'Application denied' },
    400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
    403: { description: 'Forbidden (not admin)', content: { 'application/json': { schema: apiErrorSchema } } },
    409: { description: 'Application not pending', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});
