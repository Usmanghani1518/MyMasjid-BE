import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { getOwnedProjectRecord } from './project.service';
import type { AllocationCreateInput, AllocationUpdateInput, ExpenditureCreateInput, ExpenditureUpdateInput, ForecastCreateInput, ForecastUpdateInput, InvoiceCreateInput, InvoiceUpdateInput } from './budget.schemas';

const day = (value: string, end = false) => new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
const month = (value: string) => new Date(`${value}-01T00:00:00.000Z`);
const pagination = (query: Record<string, unknown>) => ({ page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20) });
const meta = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: total ? Math.ceil(total / pageSize) : 0 });
const money = <T extends Record<string, unknown>>(row: T, fields: string[]) => ({ ...row, ...Object.fromEntries(fields.map((field) => [field, row[field] === null ? null : Number(row[field])])) });

const ensureAllocation = async (projectId: string, allocationId: string | null | undefined) => {
  if (!allocationId) return;
  const exists = await prisma.budgetAllocation.count({ where: { id: allocationId, projectId, deletedAt: null } });
  if (!exists) throw new AppError('Budget allocation not found in this project', 404, true, ErrorCodes.BUDGET_ALLOCATION_NOT_FOUND);
};

const ownedAllocation = async (ownerId: string, projectId: string, allocationId: string) => {
  await getOwnedProjectRecord(ownerId, projectId); const item = await prisma.budgetAllocation.findFirst({ where: { id: allocationId, projectId, deletedAt: null } });
  if (!item) throw new AppError('Budget allocation not found', 404, true, ErrorCodes.BUDGET_ALLOCATION_NOT_FOUND); return item;
};
const ownedExpenditure = async (ownerId: string, projectId: string, expenditureId: string) => {
  await getOwnedProjectRecord(ownerId, projectId); const item = await prisma.expenditure.findFirst({ where: { id: expenditureId, projectId, deletedAt: null } });
  if (!item) throw new AppError('Expenditure not found', 404, true, ErrorCodes.EXPENDITURE_NOT_FOUND); return item;
};
const ownedInvoice = async (ownerId: string, projectId: string, invoiceId: string) => {
  await getOwnedProjectRecord(ownerId, projectId); const item = await prisma.invoice.findFirst({ where: { id: invoiceId, projectId, deletedAt: null } });
  if (!item) throw new AppError('Invoice not found', 404, true, ErrorCodes.INVOICE_NOT_FOUND); return item;
};
const ownedForecast = async (ownerId: string, projectId: string, forecastId: string) => {
  await getOwnedProjectRecord(ownerId, projectId); const item = await prisma.budgetForecast.findFirst({ where: { id: forecastId, projectId } });
  if (!item) throw new AppError('Budget forecast not found', 404, true, ErrorCodes.BUDGET_FORECAST_NOT_FOUND); return item;
};

const invoiceView = <T extends { amount: Prisma.Decimal; status: string; dueDate: Date }>(item: T) => ({
  ...item, amount: Number(item.amount), displayStatus: item.status === 'PENDING' && item.dueDate < new Date() ? 'OVERDUE' : item.status,
});

export const getBudgetOverview = async (ownerId: string, projectId: string) => {
  const project = await getOwnedProjectRecord(ownerId, projectId);
  const [allocations, expenditures, invoices, forecasts] = await Promise.all([
    prisma.budgetAllocation.findMany({ where: { projectId, deletedAt: null }, orderBy: { position: 'asc' } }),
    prisma.expenditure.findMany({ where: { projectId, deletedAt: null }, orderBy: { expenditureDate: 'desc' } }),
    prisma.invoice.findMany({ where: { projectId, deletedAt: null }, orderBy: { dueDate: 'asc' } }),
    prisma.budgetForecast.findMany({ where: { projectId }, orderBy: { month: 'asc' } }),
  ]);
  const countedExpenditures = expenditures.filter((item) => item.status === 'APPROVED' || item.status === 'PAID');
  const totalSpent = countedExpenditures.reduce((sum, item) => sum + Number(item.amount), 0);
  const allocatedTotal = allocations.reduce((sum, item) => sum + Number(item.totalBudget), 0);
  const totalBudget = project.estimatedTotalCost ?? allocatedTotal;
  const allocationRows = allocations.map((allocation) => {
    const spent = countedExpenditures.filter((item) => item.allocationId === allocation.id).reduce((sum, item) => sum + Number(item.amount), 0);
    const total = Number(allocation.totalBudget); const usagePercent = total ? Math.round((spent / total) * 100) : 0;
    return { ...money(allocation, ['totalBudget']), spent, remaining: total - spent, usagePercent, status: usagePercent > 100 ? 'OVERSPEND_ALERT' : usagePercent >= allocation.warningThreshold ? 'WARNING' : 'HEALTHY' };
  });
  const actualByMonth = Object.fromEntries(countedExpenditures.map((item) => item.expenditureDate.toISOString().slice(0, 7)).map((key) => [key, 0]));
  for (const item of countedExpenditures) { const key = item.expenditureDate.toISOString().slice(0, 7); actualByMonth[key] += Number(item.amount); }
  return {
    project: { id: project.id, name: project.name, currency: project.currency },
    summary: { totalBudget: Number(totalBudget), totalSpent, remaining: Number(totalBudget) - totalSpent, allocatedTotal, usagePercent: Number(totalBudget) ? Math.round((totalSpent / Number(totalBudget)) * 100) : 0 },
    allocations: allocationRows,
    expenditures: expenditures.map((item) => money(item, ['amount'])),
    expenseMix: allocationRows.map((row) => ({ allocationId: row.id, name: row.name, amount: row.spent, percent: totalSpent ? Math.round((row.spent / totalSpent) * 100) : 0 })),
    forecast: forecasts.map((item) => ({ ...money(item, ['forecastAmount']), month: item.month.toISOString().slice(0, 7), actualAmount: actualByMonth[item.month.toISOString().slice(0, 7)] ?? 0 })),
    invoices: invoices.map(invoiceView),
  };
};

export const listAllocations = async (ownerId: string, projectId: string, query: Record<string, unknown>) => { await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query); const where = { projectId, deletedAt: null }; const [items, total] = await Promise.all([prisma.budgetAllocation.findMany({ where, orderBy: { position: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.budgetAllocation.count({ where })]); return { items: items.map((item) => money(item, ['totalBudget'])), pagination: meta(page, pageSize, total) }; };
export const getAllocation = async (ownerId: string, projectId: string, allocationId: string) => money(await ownedAllocation(ownerId, projectId, allocationId), ['totalBudget']);
export const createAllocation = async (ownerId: string, projectId: string, input: AllocationCreateInput) => { await getOwnedProjectRecord(ownerId, projectId); return money(await prisma.budgetAllocation.create({ data: { ...input, projectId } }), ['totalBudget']); };
export const updateAllocation = async (ownerId: string, projectId: string, allocationId: string, input: AllocationUpdateInput) => { await ownedAllocation(ownerId, projectId, allocationId); return money(await prisma.budgetAllocation.update({ where: { id: allocationId }, data: input }), ['totalBudget']); };
export const deleteAllocation = async (ownerId: string, projectId: string, allocationId: string) => { await ownedAllocation(ownerId, projectId, allocationId); await prisma.budgetAllocation.update({ where: { id: allocationId }, data: { deletedAt: new Date() } }); };

export const listExpenditures = async (ownerId: string, projectId: string, query: Record<string, unknown>) => { await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query); const where = { projectId, deletedAt: null, status: query.status ? String(query.status) as 'PENDING' | 'APPROVED' | 'PAID' | 'VOID' : undefined, allocationId: query.allocationId ? String(query.allocationId) : undefined }; const [items, total] = await Promise.all([prisma.expenditure.findMany({ where, orderBy: { expenditureDate: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.expenditure.count({ where })]); return { items: items.map((item) => money(item, ['amount'])), pagination: meta(page, pageSize, total) }; };
export const getExpenditure = async (ownerId: string, projectId: string, expenditureId: string) => money(await ownedExpenditure(ownerId, projectId, expenditureId), ['amount']);
export const createExpenditure = async (ownerId: string, projectId: string, input: ExpenditureCreateInput) => { await getOwnedProjectRecord(ownerId, projectId); await ensureAllocation(projectId, input.allocationId); return money(await prisma.expenditure.create({ data: { ...input, expenditureDate: day(input.expenditureDate), projectId } }), ['amount']); };
export const updateExpenditure = async (ownerId: string, projectId: string, expenditureId: string, input: ExpenditureUpdateInput) => { await ownedExpenditure(ownerId, projectId, expenditureId); await ensureAllocation(projectId, input.allocationId); const { expenditureDate, ...fields } = input; return money(await prisma.expenditure.update({ where: { id: expenditureId }, data: { ...fields, expenditureDate: expenditureDate ? day(expenditureDate) : undefined } }), ['amount']); };
export const deleteExpenditure = async (ownerId: string, projectId: string, expenditureId: string) => { await ownedExpenditure(ownerId, projectId, expenditureId); await prisma.expenditure.update({ where: { id: expenditureId }, data: { deletedAt: new Date() } }); };

export const listInvoices = async (ownerId: string, projectId: string, query: Record<string, unknown>) => { await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query); const requested = query.status ? String(query.status) : undefined; const where = { projectId, deletedAt: null, status: requested && requested !== 'OVERDUE' ? requested as 'PENDING' | 'PAID' | 'VOID' : undefined }; const all = await prisma.invoice.findMany({ where, orderBy: { dueDate: 'asc' } }); const filtered = all.map(invoiceView).filter((item) => !requested || item.displayStatus === requested); const items = filtered.slice((page - 1) * pageSize, page * pageSize); return { items, pagination: meta(page, pageSize, filtered.length) }; };
export const getInvoice = async (ownerId: string, projectId: string, invoiceId: string) => invoiceView(await ownedInvoice(ownerId, projectId, invoiceId));
export const createInvoice = async (ownerId: string, projectId: string, input: InvoiceCreateInput) => { await getOwnedProjectRecord(ownerId, projectId); await ensureAllocation(projectId, input.allocationId); const { dueDate, paidAt, ...fields } = input; try { return invoiceView(await prisma.invoice.create({ data: { ...fields, dueDate: day(dueDate, true), paidAt: paidAt ? new Date(paidAt) : undefined, projectId } })); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('Invoice number already exists for this project', 409, true, ErrorCodes.INVOICE_NUMBER_EXISTS); throw error; } };
export const updateInvoice = async (ownerId: string, projectId: string, invoiceId: string, input: InvoiceUpdateInput) => { const current = await ownedInvoice(ownerId, projectId, invoiceId); await ensureAllocation(projectId, input.allocationId); const { dueDate, paidAt, ...fields } = input; const finalStatus = input.status ?? current.status; const finalPaidAt = paidAt === undefined ? current.paidAt : paidAt === null ? null : new Date(paidAt); if (finalStatus === 'PAID' && !finalPaidAt) throw new AppError('paidAt is required when an invoice is marked PAID', 400, true, ErrorCodes.INVALID_INVOICE_STATUS); try { return invoiceView(await prisma.invoice.update({ where: { id: invoiceId }, data: { ...fields, dueDate: dueDate ? day(dueDate, true) : undefined, paidAt: finalPaidAt } })); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('Invoice number already exists for this project', 409, true, ErrorCodes.INVOICE_NUMBER_EXISTS); throw error; } };
export const deleteInvoice = async (ownerId: string, projectId: string, invoiceId: string) => { await ownedInvoice(ownerId, projectId, invoiceId); await prisma.invoice.update({ where: { id: invoiceId }, data: { deletedAt: new Date() } }); };

export const listForecasts = async (ownerId: string, projectId: string) => { await getOwnedProjectRecord(ownerId, projectId); return (await prisma.budgetForecast.findMany({ where: { projectId }, orderBy: { month: 'asc' } })).map((item) => ({ ...money(item, ['forecastAmount']), month: item.month.toISOString().slice(0, 7) })); };
export const getForecast = async (ownerId: string, projectId: string, forecastId: string) => { const item = await ownedForecast(ownerId, projectId, forecastId); return { ...money(item, ['forecastAmount']), month: item.month.toISOString().slice(0, 7) }; };
export const createForecast = async (ownerId: string, projectId: string, input: ForecastCreateInput) => { await getOwnedProjectRecord(ownerId, projectId); try { const item = await prisma.budgetForecast.create({ data: { projectId, month: month(input.month), forecastAmount: input.forecastAmount } }); return { ...money(item, ['forecastAmount']), month: item.month.toISOString().slice(0, 7) }; } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A forecast already exists for this project and month', 409, true, ErrorCodes.BUDGET_FORECAST_EXISTS); throw error; } };
export const updateForecast = async (ownerId: string, projectId: string, forecastId: string, input: ForecastUpdateInput) => { await ownedForecast(ownerId, projectId, forecastId); const item = await prisma.budgetForecast.update({ where: { id: forecastId }, data: { month: input.month ? month(input.month) : undefined, forecastAmount: input.forecastAmount } }); return { ...money(item, ['forecastAmount']), month: item.month.toISOString().slice(0, 7) }; };
export const deleteForecast = async (ownerId: string, projectId: string, forecastId: string) => { await ownedForecast(ownerId, projectId, forecastId); await prisma.budgetForecast.delete({ where: { id: forecastId } }); };
