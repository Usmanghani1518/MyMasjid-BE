import { describe, expect, it } from 'vitest';
import { projectCreateBodySchema, projectUpdateBodySchema } from '@/modules/project/project.schemas';

const validProject = {
  name: 'Masjid Extension',
  category: 'Construction',
  managerName: 'Ahmed Khan',
  location: 'London',
  description: 'Expansion of the main prayer hall.',
  currency: 'gbp',
  estimatedTotalCost: 250000,
  fundraisingGoal: 180000,
  seedFunding: 45000,
  startDate: '2026-10-01',
  completionDate: '2027-04-01',
  fundingSources: [
    { id: 'zakat', label: 'Zakat', percentage: 40 },
    { id: 'sadaqah', label: 'Sadaqah', percentage: 60 },
  ],
};

describe('project schemas', () => {
  it('accepts a complete project and normalizes its currency', () => {
    const parsed = projectCreateBodySchema.parse(validProject);
    expect(parsed.currency).toBe('GBP');
  });

  it('rejects inconsistent dates, amounts, and funding-source percentages', () => {
    const parsed = projectCreateBodySchema.safeParse({
      ...validProject,
      fundraisingGoal: 300000,
      seedFunding: 310000,
      completionDate: '2026-09-01',
      fundingSources: [{ id: 'zakat', label: 'Zakat', percentage: 40 }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['completionDate', 'fundraisingGoal', 'seedFunding', 'fundingSources']),
    );
  });

  it('accepts partial updates but rejects an empty update', () => {
    expect(projectUpdateBodySchema.parse({ status: 'ACTIVE', constructionProgress: 25 })).toEqual({
      status: 'ACTIVE', constructionProgress: 25,
    });
    expect(projectUpdateBodySchema.safeParse({}).success).toBe(false);
  });
});
