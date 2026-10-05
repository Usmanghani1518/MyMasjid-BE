import { z } from 'zod';
import { projectIdParams } from './milestone.schemas';

export const expenditureStatuses = ['PENDING', 'APPROVED', 'PAID', 'VOID'] as const;
export const invoiceStatuses = ['PENDING', 'PAID', 'OVERDUE', 'VOID'] as const;
const emptyQuery = z.object({}).passthrough();
const listQuery = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).passthrough();

const allocationFields = z.object({
  name: z.string().trim().min(1).max(200), totalBudget: z.number().positive(),
  warningThreshold: z.number().int().min(1).max(100).optional(), position: z.number().int().nonnegative().optional(),
}).strict();
const expenditureFields = z.object({
  allocationId: z.uuid().nullable().optional(), vendor: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000), amount: z.number().positive(), expenditureDate: z.iso.date(),
  status: z.enum(expenditureStatuses).optional(), invoiceReference: z.string().trim().max(100).nullable().optional(),
  receiptUrl: z.url().nullable().optional(), notes: z.string().trim().max(5000).nullable().optional(),
}).strict();
const invoiceFieldsBase = z.object({
  allocationId: z.uuid().nullable().optional(), vendor: z.string().trim().min(1).max(200),
  invoiceNumber: z.string().trim().min(1).max(100), amount: z.number().positive(), dueDate: z.iso.date(),
  status: z.enum(invoiceStatuses).optional(), paidAt: z.iso.datetime().nullable().optional(),
  documentUrl: z.url().nullable().optional(), notes: z.string().trim().max(5000).nullable().optional(),
}).strict();
const invoiceFields = invoiceFieldsBase.superRefine((data, ctx) => {
  if (data.status === 'PAID' && !data.paidAt) ctx.addIssue({ code: 'custom', path: ['paidAt'], message: 'paidAt is required when an invoice is marked PAID' });
});
const forecastFields = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM format'), forecastAmount: z.number().nonnegative(),
}).strict();
const nonEmptyPartial = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.partial().superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: 'custom', message: 'At least one field must be provided' });
});

export const allocationCreateBody = allocationFields;
export const allocationUpdateBody = nonEmptyPartial(allocationFields);
export const expenditureCreateBody = expenditureFields;
export const expenditureUpdateBody = nonEmptyPartial(expenditureFields);
export const invoiceCreateBody = invoiceFields;
export const invoiceUpdateBody = invoiceFieldsBase.partial().superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: 'custom', message: 'At least one field must be provided' });
  if (data.status === 'PAID' && data.paidAt === null) ctx.addIssue({ code: 'custom', path: ['paidAt'], message: 'paidAt cannot be null when an invoice is marked PAID' });
});
export const forecastCreateBody = forecastFields;
export const forecastUpdateBody = nonEmptyPartial(forecastFields);

export const allocationIdParams = projectIdParams.extend({ allocationId: z.uuid() });
export const expenditureIdParams = projectIdParams.extend({ expenditureId: z.uuid() });
export const invoiceIdParams = projectIdParams.extend({ invoiceId: z.uuid() });
export const forecastIdParams = projectIdParams.extend({ forecastId: z.uuid() });

const make = (body: z.ZodType, params: z.ZodType) => z.object({ body, params, query: emptyQuery });
export const budgetOverviewSchema = z.object({ body: z.any(), params: projectIdParams, query: emptyQuery });
export const listAllocationsSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery });
export const createAllocationSchema = make(allocationCreateBody, projectIdParams);
export const updateAllocationSchema = make(allocationUpdateBody, allocationIdParams);
export const allocationParamsSchema = make(z.any(), allocationIdParams);
export const listExpendituresSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery.extend({ status: z.enum(expenditureStatuses).optional(), allocationId: z.uuid().optional() }) });
export const createExpenditureSchema = make(expenditureCreateBody, projectIdParams);
export const updateExpenditureSchema = make(expenditureUpdateBody, expenditureIdParams);
export const expenditureParamsSchema = make(z.any(), expenditureIdParams);
export const listInvoicesSchema = z.object({ body: z.any(), params: projectIdParams, query: listQuery.extend({ status: z.enum(invoiceStatuses).optional() }) });
export const createInvoiceSchema = make(invoiceCreateBody, projectIdParams);
export const updateInvoiceSchema = make(invoiceUpdateBody, invoiceIdParams);
export const invoiceParamsSchema = make(z.any(), invoiceIdParams);
export const listForecastsSchema = z.object({ body: z.any(), params: projectIdParams, query: emptyQuery });
export const createForecastSchema = make(forecastCreateBody, projectIdParams);
export const updateForecastSchema = make(forecastUpdateBody, forecastIdParams);
export const forecastParamsSchema = make(z.any(), forecastIdParams);

export const budgetMutationBody = z.union([
  z.object({ resource: z.literal('ALLOCATION'), action: z.literal('CREATE'), data: allocationCreateBody }).strict(),
  z.object({ resource: z.literal('ALLOCATION'), action: z.literal('UPDATE'), id: z.uuid(), data: allocationUpdateBody }).strict(),
  z.object({ resource: z.literal('ALLOCATION'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('EXPENDITURE'), action: z.literal('CREATE'), data: expenditureCreateBody }).strict(),
  z.object({ resource: z.literal('EXPENDITURE'), action: z.literal('UPDATE'), id: z.uuid(), data: expenditureUpdateBody }).strict(),
  z.object({ resource: z.literal('EXPENDITURE'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('INVOICE'), action: z.literal('CREATE'), data: invoiceCreateBody }).strict(),
  z.object({ resource: z.literal('INVOICE'), action: z.literal('UPDATE'), id: z.uuid(), data: invoiceUpdateBody }).strict(),
  z.object({ resource: z.literal('INVOICE'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
  z.object({ resource: z.literal('FORECAST'), action: z.literal('CREATE'), data: forecastCreateBody }).strict(),
  z.object({ resource: z.literal('FORECAST'), action: z.literal('UPDATE'), id: z.uuid(), data: forecastUpdateBody }).strict(),
  z.object({ resource: z.literal('FORECAST'), action: z.literal('DELETE'), id: z.uuid() }).strict(),
]);
export const mutateBudgetSchema = z.object({ body: budgetMutationBody, params: projectIdParams, query: emptyQuery });

export type AllocationCreateInput = z.infer<typeof allocationCreateBody>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateBody>;
export type ExpenditureCreateInput = z.infer<typeof expenditureCreateBody>;
export type ExpenditureUpdateInput = z.infer<typeof expenditureUpdateBody>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateBody>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateBody>;
export type ForecastCreateInput = z.infer<typeof forecastCreateBody>;
export type ForecastUpdateInput = z.infer<typeof forecastUpdateBody>;
