import { z } from 'zod';

/** List applications with optional status/search filters. Pagination/sort parsed in the service. */
export const listApplicationsSchema = z.object({
  query: z.object({
    status: z.enum(['PENDING_REVIEW', 'APPROVED', 'DENIED', 'DRAFT']).optional(),
    search: z.string().trim().max(100).optional(),
  }),
});

export const applicationParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid application id'),
  }),
});

/** Deny with structured, per-field reasons. */
export const denyApplicationSchema = z.object({
  body: z.object({
    reasons: z
      .array(
        z.object({
          field: z.string().trim().max(100).optional(),
          code: z.string().trim().min(1).max(100),
          message: z.string().trim().min(1).max(500),
        }),
        { message: 'Reasons are required' },
      )
      .min(1, 'Provide at least one reason'),
    note: z.string().trim().max(1000).optional(),
  }),
});

export const approveApplicationSchema = z.object({ body: z.object({}) });
