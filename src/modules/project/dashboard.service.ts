import { prisma } from '@/config/database';
import { getBudgetOverview } from './budget.service';
import { getConstructionOverview } from './construction.service';
import { getOwnedMasjidId, getOwnedProjectRecord, getProjectSummary } from './project.service';

export const getProjectsDashboard = async (ownerId: string) => {
  const masjidId = await getOwnedMasjidId(ownerId);
  const [summary, recentProjects, moneyTotals, milestoneGroups, upcomingMilestones] = await Promise.all([
    getProjectSummary(ownerId),
    prisma.project.findMany({
      where: { masjidId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 6,
      include: { _count: { select: { milestones: { where: { deletedAt: null } }, constructionLogs: { where: { deletedAt: null } } } } },
    }),
    prisma.project.aggregate({ where: { masjidId, deletedAt: null }, _sum: { estimatedTotalCost: true, fundraisingGoal: true, seedFunding: true, raisedAmount: true } }),
    prisma.projectMilestone.groupBy({ by: ['status'], where: { project: { masjidId, deletedAt: null }, deletedAt: null }, _count: { _all: true } }),
    prisma.projectMilestone.findMany({
      where: { project: { masjidId, deletedAt: null }, deletedAt: null, status: { not: 'COMPLETED' }, dueDate: { not: null } },
      orderBy: { dueDate: 'asc' }, take: 8, select: { id: true, projectId: true, name: true, status: true, progressPercent: true, dueDate: true, project: { select: { name: true } } },
    }),
  ]);
  const milestoneCounts = Object.fromEntries(milestoneGroups.map((row) => [row.status, row._count._all]));
  return {
    summary,
    funding: {
      estimatedTotalCost: Number(moneyTotals._sum.estimatedTotalCost ?? 0), fundraisingGoal: Number(moneyTotals._sum.fundraisingGoal ?? 0),
      seedFunding: Number(moneyTotals._sum.seedFunding ?? 0), raisedAmount: Number(moneyTotals._sum.raisedAmount ?? 0),
    },
    milestones: { completed: milestoneCounts.COMPLETED ?? 0, inProgress: milestoneCounts.IN_PROGRESS ?? 0, upcoming: milestoneCounts.UPCOMING ?? 0 },
    recentProjects: recentProjects.map((project) => ({ ...project, estimatedTotalCost: project.estimatedTotalCost === null ? null : Number(project.estimatedTotalCost), fundraisingGoal: project.fundraisingGoal === null ? null : Number(project.fundraisingGoal), seedFunding: Number(project.seedFunding), raisedAmount: Number(project.raisedAmount) })),
    upcomingMilestones,
  };
};

export const getProjectDashboard = async (ownerId: string, projectId: string) => {
  const [project, budget, construction, milestoneGroups] = await Promise.all([
    getOwnedProjectRecord(ownerId, projectId),
    getBudgetOverview(ownerId, projectId),
    getConstructionOverview(ownerId, projectId),
    prisma.projectMilestone.groupBy({ by: ['status'], where: { projectId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(milestoneGroups.map((row) => [row.status, row._count._all]));
  return {
    project: { ...project, estimatedTotalCost: project.estimatedTotalCost === null ? null : Number(project.estimatedTotalCost), fundraisingGoal: project.fundraisingGoal === null ? null : Number(project.fundraisingGoal), seedFunding: Number(project.seedFunding), raisedAmount: Number(project.raisedAmount) },
    milestoneSummary: { total: milestoneGroups.reduce((sum, row) => sum + row._count._all, 0), completed: counts.COMPLETED ?? 0, inProgress: counts.IN_PROGRESS ?? 0, upcoming: counts.UPCOMING ?? 0 },
    budget: { summary: budget.summary, expenseMix: budget.expenseMix, forecast: budget.forecast, recentInvoices: budget.invoices },
    construction: { phases: construction.phases, recentLogs: construction.logs, gallery: construction.gallery, contractorReports: construction.contractorReports },
  };
};

