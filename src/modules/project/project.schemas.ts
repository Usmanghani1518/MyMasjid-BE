import { z } from 'zod';

export const projectStatuses = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;

const fundingSourceSchema = z.object({
  id: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  percentage: z.number().int().min(0).max(100),
}).strict();

export const projectMilestoneDraftSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200),
  durationWeeks: z.number().int().positive().max(520),
}).strict();

const mediaSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.url(),
  label: z.string().trim().min(1).max(255),
}).strict();

const documentSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['PLANNING_PERMISSION', 'STRUCTURAL_AUDIT', 'ENVIRONMENTAL_ASSESSMENT', 'OTHER']),
  name: z.string().trim().min(1).max(255),
  url: z.url(),
}).strict();

const projectFieldsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(100),
  managerName: z.string().trim().min(1).max(150),
  location: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(5000),
  coverImageUrl: z.url().nullable().optional(),
  status: z.enum(projectStatuses).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  estimatedTotalCost: z.number().positive().nullable().optional(),
  fundraisingGoal: z.number().positive().nullable().optional(),
  seedFunding: z.number().nonnegative().optional(),
  raisedAmount: z.number().nonnegative().optional(),
  constructionProgress: z.number().int().min(0).max(100).optional(),
  notice: z.string().trim().max(1000).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  completionDate: z.iso.date().nullable().optional(),
  fundingSources: z.array(fundingSourceSchema).max(20).optional(),
  milestones: z.array(projectMilestoneDraftSchema).max(100).optional(),
  media: z.array(mediaSchema).max(100).optional(),
  complianceDocuments: z.array(documentSchema).max(100).optional(),
}).strict();

const validateRelatedFields = (
  data: z.infer<typeof projectFieldsSchema> | Partial<z.infer<typeof projectFieldsSchema>>,
  ctx: z.RefinementCtx,
) => {
  if (data.startDate && data.completionDate && data.completionDate < data.startDate) {
    ctx.addIssue({ code: 'custom', path: ['completionDate'], message: 'Completion date cannot be before start date' });
  }
  if (data.estimatedTotalCost && data.fundraisingGoal && data.fundraisingGoal > data.estimatedTotalCost) {
    ctx.addIssue({ code: 'custom', path: ['fundraisingGoal'], message: 'Fundraising goal cannot exceed estimated total cost' });
  }
  if (data.fundraisingGoal && data.seedFunding !== undefined && data.seedFunding > data.fundraisingGoal) {
    ctx.addIssue({ code: 'custom', path: ['seedFunding'], message: 'Seed funding cannot exceed fundraising goal' });
  }
  if (data.fundingSources?.length) {
    const total = data.fundingSources.reduce((sum, source) => sum + source.percentage, 0);
    if (total !== 100) {
      ctx.addIssue({ code: 'custom', path: ['fundingSources'], message: 'Funding source percentages must total 100' });
    }
  }
};

export const projectCreateBodySchema = projectFieldsSchema.superRefine(validateRelatedFields);
export const projectUpdateBodySchema = projectFieldsSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({ code: 'custom', message: 'At least one project field must be provided' });
  }
  validateRelatedFields(data, ctx);
});

const idParams = z.object({ id: z.uuid() });
const anyQuery = z.object({}).passthrough();

export const createProjectSchema = z.object({ body: projectCreateBodySchema, query: anyQuery, params: z.object({}) });
export const updateProjectSchema = z.object({ body: projectUpdateBodySchema, query: anyQuery, params: idParams });
export const projectParamsSchema = z.object({ body: z.any(), query: anyQuery, params: idParams });
export const listProjectsSchema = z.object({
  body: z.any(),
  params: z.object({}),
  query: z.object({
    search: z.string().trim().max(150).optional(),
    status: z.enum(projectStatuses).optional(),
    category: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'startDate', 'completionDate']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }).strict(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateBodySchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateBodySchema>;
