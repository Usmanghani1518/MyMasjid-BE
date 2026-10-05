import { z } from 'zod';

export const milestoneStatuses = ['COMPLETED', 'IN_PROGRESS', 'UPCOMING'] as const;

const milestoneFields = z.object({
  name: z.string().trim().min(1).max(200),
  phaseLabel: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(milestoneStatuses).optional(),
  durationWeeks: z.number().int().positive().max(520).nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  plannedStartDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  completedAt: z.iso.datetime().nullable().optional(),
  primaryContractor: z.string().trim().max(200).nullable().optional(),
  leadEngineer: z.string().trim().max(150).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
}).strict();

const validateDates = (data: Partial<z.infer<typeof milestoneFields>>, ctx: z.RefinementCtx) => {
  if (data.plannedStartDate && data.dueDate && data.dueDate < data.plannedStartDate) {
    ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date cannot be before planned start date' });
  }
};

export const milestoneCreateBody = milestoneFields.superRefine(validateDates);
export const milestoneUpdateBody = milestoneFields.partial().superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: 'custom', message: 'At least one milestone field must be provided' });
  validateDates(data, ctx);
});
export const milestoneProgressUpdateBody = z.object({
  message: z.string().trim().min(1).max(5000),
  progressPercent: z.number().int().min(0).max(100).optional(),
  status: z.enum(milestoneStatuses).optional(),
}).strict();
export const milestoneCommentCreateBody = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export const milestoneCommentUpdateBody = milestoneCommentCreateBody;

export const projectIdParams = z.object({ projectId: z.uuid() });
export const milestoneIdParams = projectIdParams.extend({ milestoneId: z.uuid() });
export const commentIdParams = milestoneIdParams.extend({ commentId: z.uuid() });
const query = z.object({
  status: z.enum(milestoneStatuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const listMilestonesSchema = z.object({ body: z.any(), params: projectIdParams, query });
export const createMilestoneSchema = z.object({ body: milestoneCreateBody, params: projectIdParams, query: z.object({}).passthrough() });
export const updateMilestoneSchema = z.object({ body: milestoneUpdateBody, params: milestoneIdParams, query: z.object({}).passthrough() });
export const milestoneParamsSchema = z.object({ body: z.any(), params: milestoneIdParams, query: z.object({}).passthrough() });
export const createMilestoneUpdateSchema = z.object({ body: milestoneProgressUpdateBody, params: milestoneIdParams, query: z.object({}).passthrough() });
export const createCommentSchema = z.object({ body: milestoneCommentCreateBody, params: milestoneIdParams, query: z.object({}).passthrough() });
export const updateCommentSchema = z.object({ body: milestoneCommentUpdateBody, params: commentIdParams, query: z.object({}).passthrough() });
export const commentParamsSchema = z.object({ body: z.any(), params: commentIdParams, query: z.object({}).passthrough() });

export const milestoneMutationBody = z.union([
  z.object({ resource: z.literal('MILESTONE'), action: z.literal('CREATE'), data: milestoneCreateBody }).strict(),
  z.object({ resource: z.literal('MILESTONE'), action: z.literal('UPDATE'), id: z.uuid(), data: milestoneUpdateBody }).strict(),
  z.object({ resource: z.literal('MILESTONE'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('UPDATE'), action: z.literal('CREATE'), milestoneId: z.uuid(), data: milestoneProgressUpdateBody }).strict(),
  z.object({ resource: z.literal('COMMENT'), action: z.literal('CREATE'), milestoneId: z.uuid(), data: milestoneCommentCreateBody }).strict(),
  z.object({ resource: z.literal('COMMENT'), action: z.literal('UPDATE'), milestoneId: z.uuid(), id: z.uuid(), data: milestoneCommentUpdateBody }).strict(),
  z.object({ resource: z.literal('COMMENT'), action: z.literal('DELETE'), milestoneId: z.uuid(), id: z.uuid() }).strict(),
]);
export const mutateMilestonesSchema = z.object({ body: milestoneMutationBody, params: projectIdParams, query: z.object({}).passthrough() });

export type MilestoneCreateInput = z.infer<typeof milestoneCreateBody>;
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateBody>;
export type MilestoneProgressUpdateInput = z.infer<typeof milestoneProgressUpdateBody>;
