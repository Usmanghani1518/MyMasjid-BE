import { describe, expect, it } from 'vitest';
import { invoiceCreateBody, forecastCreateBody } from '@/modules/project/budget.schemas';
import { constructionLogCreateBody } from '@/modules/project/construction.schemas';
import { milestoneCreateBody } from '@/modules/project/milestone.schemas';

describe('project tracking schemas', () => {
  it('validates milestone dates and progress', () => {
    expect(milestoneCreateBody.safeParse({ name: 'Roof', progressPercent: 101 }).success).toBe(false);
    expect(milestoneCreateBody.safeParse({ name: 'Roof', plannedStartDate: '2027-03-01', dueDate: '2027-02-01' }).success).toBe(false);
    expect(milestoneCreateBody.safeParse({ name: 'Roof', status: 'IN_PROGRESS', progressPercent: 60 }).success).toBe(true);
  });

  it('requires paid invoices to include paidAt', () => {
    expect(invoiceCreateBody.safeParse({ vendor: 'Builder', invoiceNumber: 'INV-1', amount: 100, dueDate: '2027-01-01', status: 'PAID' }).success).toBe(false);
    expect(invoiceCreateBody.safeParse({ vendor: 'Builder', invoiceNumber: 'INV-1', amount: 100, dueDate: '2027-01-01', status: 'PAID', paidAt: '2026-12-20T10:00:00.000Z' }).success).toBe(true);
  });

  it('accepts construction logs with nested media references', () => {
    const parsed = constructionLogCreateBody.safeParse({
      logDate: '2026-10-12', title: 'Roof beams installed', body: 'All roof beams secured.',
      assets: [{ kind: 'IMAGE', url: 'https://cdn.example.com/roof.jpg', label: 'Roof beams' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('requires forecast months in YYYY-MM form', () => {
    expect(forecastCreateBody.safeParse({ month: '2026-10', forecastAmount: 5000 }).success).toBe(true);
    expect(forecastCreateBody.safeParse({ month: 'October', forecastAmount: 5000 }).success).toBe(false);
  });
});

