import { z } from 'zod';

const tierSchema = z.object({
  id: z.string().min(1).max(100),
  amount: z.number().positive(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
});

const faqSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().trim().max(300),
  answer: z.string().trim().max(2000),
});

export const campaignBodySchema = z.object({
  name: z.string().trim().max(150).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  project: z.string().trim().max(150).nullable().optional(),
  description: z.string().trim().max(160).nullable().optional(),
  coverImageUrl: z.url().nullable().optional(),
  coverImagePublicId: z.string().max(300).nullable().optional(),
  videoUrl: z.url().nullable().optional(),
  videoPublicId: z.string().max(300).nullable().optional(),
  gallery: z.array(z.object({ url: z.url(), publicId: z.string().max(300).optional() })).max(5).optional(),
  goal: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
  donationTiers: z.array(tierSchema).max(20).optional(),
  story: z.string().trim().max(50000).nullable().optional(),
  impact: z.string().trim().max(120).nullable().optional(),
  faqs: z.array(faqSchema).max(30).optional(),
}).strict();

export const createCampaignSchema = z.object({ body: campaignBodySchema, query: z.any(), params: z.any() });
export const updateCampaignSchema = z.object({ body: campaignBodySchema, query: z.any(), params: z.object({ id: z.uuid() }) });
export const campaignParamsSchema = z.object({ body: z.any(), query: z.any(), params: z.object({ id: z.uuid() }) });
export const listCampaignsSchema = z.object({
  body: z.any(), params: z.any(),
  query: z.object({
    search: z.string().max(150).optional(),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED']).optional(),
    category: z.string().max(100).optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  }).passthrough(),
});

export type CampaignInput = z.infer<typeof campaignBodySchema>;
