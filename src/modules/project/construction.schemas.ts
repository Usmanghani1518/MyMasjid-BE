import { z } from 'zod';
import { projectIdParams } from './milestone.schemas';

export const mediaKinds = ['IMAGE', 'VIDEO', 'THREE_D_RENDER'] as const;
const mediaAssetInput = z.object({
  kind: z.enum(mediaKinds), url: z.url(), label: z.string().trim().min(1).max(255),
  position: z.number().int().nonnegative().optional(),
}).strict();
const assetInput = mediaAssetInput.extend({
  milestoneId: z.uuid().nullable().optional(),
  altText: z.string().trim().max(500).nullable().optional(),
}).strict();

const logFields = z.object({
  milestoneId: z.uuid().nullable().optional(),
  type: z.enum(['DAILY', 'WEEKLY']).optional(),
  logDate: z.iso.date(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
  delayMinutes: z.number().int().nonnegative().max(525600).optional(),
  safetyIncident: z.boolean().optional(),
  assets: z.array(mediaAssetInput).max(50).optional(),
}).strict();
export const constructionLogCreateBody = logFields;
export const constructionLogUpdateBody = logFields.partial().superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: 'custom', message: 'At least one construction log field must be provided' });
});

const reportFields = z.object({
  title: z.string().trim().min(1).max(200), reportType: z.string().trim().min(1).max(100),
  contractorName: z.string().trim().max(200).nullable().optional(), reportingPeriod: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(), fileUrl: z.url(),
  verified: z.boolean().optional(), verifiedBy: z.string().trim().max(150).nullable().optional(),
}).strict();
export const contractorReportCreateBody = reportFields;
export const contractorReportUpdateBody = reportFields.partial().superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: 'custom', message: 'At least one report field must be provided' });
});

const listQuery = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const emptyQuery = z.object({}).passthrough();
export const logIdParams = projectIdParams.extend({ logId: z.uuid() });
export const assetIdParams = projectIdParams.extend({ assetId: z.uuid() });
export const reportIdParams = projectIdParams.extend({ reportId: z.uuid() });

export const constructionOverviewSchema = z.object({ body: z.any(), params: projectIdParams, query: emptyQuery });
export const listConstructionLogsSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery });
export const createConstructionLogSchema = z.object({ body: constructionLogCreateBody, params: projectIdParams, query: emptyQuery });
export const updateConstructionLogSchema = z.object({ body: constructionLogUpdateBody, params: logIdParams, query: emptyQuery });
export const constructionLogParamsSchema = z.object({ body: z.any(), params: logIdParams, query: emptyQuery });
export const listAssetsSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery });
export const createAssetSchema = z.object({ body: assetInput, params: projectIdParams, query: emptyQuery });
export const updateAssetSchema = z.object({ body: assetInput.partial(), params: assetIdParams, query: emptyQuery });
export const assetParamsSchema = z.object({ body: z.any(), params: assetIdParams, query: emptyQuery });
export const listReportsSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery });
export const createReportSchema = z.object({ body: contractorReportCreateBody, params: projectIdParams, query: emptyQuery });
export const updateReportSchema = z.object({ body: contractorReportUpdateBody, params: reportIdParams, query: emptyQuery });
export const reportParamsSchema = z.object({ body: z.any(), params: reportIdParams, query: emptyQuery });

export const constructionMutationBody = z.union([
  z.object({ resource: z.literal('LOG'), action: z.literal('CREATE'), data: constructionLogCreateBody }).strict(),
  z.object({ resource: z.literal('LOG'), action: z.literal('UPDATE'), id: z.uuid(), data: constructionLogUpdateBody }).strict(),
  z.object({ resource: z.literal('LOG'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('ASSET'), action: z.literal('CREATE'), data: assetInput }).strict(),
  z.object({ resource: z.literal('ASSET'), action: z.literal('UPDATE'), id: z.uuid(), data: assetInput.partial() }).strict(),
  z.object({ resource: z.literal('ASSET'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('REPORT'), action: z.literal('CREATE'), data: contractorReportCreateBody }).strict(),
  z.object({ resource: z.literal('REPORT'), action: z.literal('UPDATE'), id: z.uuid(), data: contractorReportUpdateBody }).strict(),
  z.object({ resource: z.literal('REPORT'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
]);
export const mutateConstructionSchema = z.object({ body: constructionMutationBody, params: projectIdParams, query: emptyQuery });

export type ConstructionLogCreateInput = z.infer<typeof constructionLogCreateBody>;
export type ConstructionLogUpdateInput = z.infer<typeof constructionLogUpdateBody>;
export type ProjectAssetInput = z.infer<typeof assetInput>;
export type ContractorReportCreateInput = z.infer<typeof contractorReportCreateBody>;
export type ContractorReportUpdateInput = z.infer<typeof contractorReportUpdateBody>;
