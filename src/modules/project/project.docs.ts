import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';
import { projectCreateBodySchema, projectStatuses, projectUpdateBodySchema } from './project.schemas';

extendZodWithOpenApi(z);

const errorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  data: z.null(),
  errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })),
}).openapi('ProjectErrorResponse');

const projectSchema = z.object({
  id: z.uuid(),
  masjidId: z.uuid(),
  name: z.string(),
  category: z.string(),
  managerName: z.string(),
  location: z.string(),
  description: z.string(),
  coverImageUrl: z.url().nullable(),
  status: z.enum(projectStatuses),
  currency: z.string().length(3),
  estimatedTotalCost: z.number().nullable(),
  fundraisingGoal: z.number().nullable(),
  seedFunding: z.number(),
  raisedAmount: z.number(),
  constructionProgress: z.number().int().min(0).max(100),
  notice: z.string().nullable(),
  startDate: z.string().datetime().nullable(),
  completionDate: z.string().datetime().nullable(),
  fundingSources: z.array(z.unknown()),
  milestones: z.array(z.unknown()),
  media: z.array(z.unknown()),
  complianceDocuments: z.array(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.null(),
}).openapi('Project');

const successEnvelope = <T extends z.ZodType>(data: T) => z.object({
  success: z.literal(true),
  message: z.string(),
  data,
  errors: z.array(z.unknown()).describe('Empty for successful responses'),
});

const projectResultSchema = successEnvelope(z.object({ project: projectSchema })).openapi('ProjectResult');
const projectListSchema = successEnvelope(z.object({
  items: z.array(projectSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})).openapi('ProjectListResult');
const projectSummarySchema = successEnvelope(z.object({
  totalProjects: z.number().int(),
  activeProjects: z.number().int(),
  completedProjects: z.number().int(),
  plannedProjects: z.number().int(),
})).openapi('ProjectSummaryResult');

const securedErrors = {
  400: { description: 'Request validation or project consistency failure', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'Missing, expired, revoked, or stale access token', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'Only MASJID_ADMIN may access projects for their own active Masjid', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Project not found in the authenticated admin’s Masjid', content: { 'application/json': { schema: errorSchema } } },
};
const idParams = z.object({ id: z.uuid() });

registry.registerPath({
  method: 'post', path: '/masjid/projects', tags: ['Masjid Projects'], summary: 'Create a project',
  description: 'Creates a PLANNED project by default. Nested funding sources, milestone drafts, media references, and compliance document references are stored atomically with the project.',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: projectCreateBodySchema } } } },
  responses: { 201: { description: 'Project created', content: { 'application/json': { schema: projectResultSchema } } }, ...securedErrors },
});

registry.registerPath({
  method: 'get', path: '/masjid/projects', tags: ['Masjid Projects'], summary: 'List projects',
  description: 'Returns only non-deleted projects belonging to the authenticated administrator’s active Masjid.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({
    search: z.string().optional(), status: z.enum(projectStatuses).optional(), category: z.string().optional(),
    page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'startDate', 'completionDate']).optional(), sortOrder: z.enum(['asc', 'desc']).optional(),
  }) },
  responses: { 200: { description: 'Filtered and paginated project list', content: { 'application/json': { schema: projectListSchema } } }, ...securedErrors },
});

registry.registerPath({
  method: 'get', path: '/masjid/projects/summary', tags: ['Masjid Projects'], summary: 'Get project dashboard counts',
  description: 'Returns total, ACTIVE, COMPLETED, and PLANNED counts. Soft-deleted projects are excluded.',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Project counts', content: { 'application/json': { schema: projectSummarySchema } } }, ...securedErrors },
});

registry.registerPath({
  method: 'get', path: '/masjid/projects/{id}', tags: ['Masjid Projects'], summary: 'Get one project', security: [{ bearerAuth: [] }],
  request: { params: idParams }, responses: { 200: { description: 'Project retrieved', content: { 'application/json': { schema: projectResultSchema } } }, ...securedErrors },
});

registry.registerPath({
  method: 'patch', path: '/masjid/projects/{id}', tags: ['Masjid Projects'], summary: 'Partially update a project', security: [{ bearerAuth: [] }],
  request: { params: idParams, body: { content: { 'application/json': { schema: projectUpdateBodySchema } } } },
  responses: { 200: { description: 'Project updated', content: { 'application/json': { schema: projectResultSchema } } }, ...securedErrors },
});

registry.registerPath({
  method: 'delete', path: '/masjid/projects/{id}', tags: ['Masjid Projects'], summary: 'Soft-delete a project',
  description: 'The project stops appearing in lists, summary counts, and direct reads.', security: [{ bearerAuth: [] }],
  request: { params: idParams }, responses: { 200: { description: 'Project deleted' }, ...securedErrors },
});
