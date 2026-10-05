import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { getOwnedProjectRecord } from './project.service';
import type { ConstructionLogCreateInput, ConstructionLogUpdateInput, ContractorReportCreateInput, ContractorReportUpdateInput, ProjectAssetInput } from './construction.schemas';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const pagination = (query: Record<string, unknown>) => ({ page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20) });
const meta = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: total ? Math.ceil(total / pageSize) : 0 });

const ensureMilestone = async (projectId: string, milestoneId: string | null | undefined) => {
  if (!milestoneId) return;
  const exists = await prisma.projectMilestone.count({ where: { id: milestoneId, projectId, deletedAt: null } });
  if (!exists) throw new AppError('Milestone not found in this project', 404, true, ErrorCodes.MILESTONE_NOT_FOUND);
};

const ownedLog = async (ownerId: string, projectId: string, logId: string) => {
  await getOwnedProjectRecord(ownerId, projectId);
  const log = await prisma.constructionLog.findFirst({ where: { id: logId, projectId, deletedAt: null }, include: { assets: { orderBy: { position: 'asc' } } } });
  if (!log) throw new AppError('Construction log not found', 404, true, ErrorCodes.CONSTRUCTION_LOG_NOT_FOUND);
  return log;
};

export const getConstructionOverview = async (ownerId: string, projectId: string) => {
  const project = await getOwnedProjectRecord(ownerId, projectId);
  const [phases, logs, gallery, contractorReports] = await Promise.all([
    prisma.projectMilestone.findMany({
      where: { projectId, deletedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        assets: { where: { deletedAt: null }, orderBy: { position: 'asc' } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        updates: { orderBy: { createdAt: 'desc' } },
        _count: { select: { assets: { where: { deletedAt: null } }, comments: { where: { deletedAt: null } }, updates: true } },
      },
    }),
    prisma.constructionLog.findMany({ where: { projectId, deletedAt: null }, orderBy: { logDate: 'desc' }, include: { assets: { orderBy: { position: 'asc' } } } }),
    prisma.projectAsset.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] }),
    prisma.contractorReport.findMany({ where: { projectId, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    project,
    summary: { progressPercent: project.constructionProgress, phases: phases.length, logs: logs.length, galleryAssets: gallery.length, contractorReports: contractorReports.length },
    phases,
    logs,
    gallery,
    contractorReports,
  };
};

export const listLogs = async (ownerId: string, projectId: string, query: Record<string, unknown>) => {
  await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query);
  const where = { projectId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.constructionLog.findMany({ where, orderBy: { logDate: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { assets: { orderBy: { position: 'asc' } } } }),
    prisma.constructionLog.count({ where }),
  ]);
  return { items, pagination: meta(page, pageSize, total) };
};

export const createLog = async (ownerId: string, projectId: string, author: { id: string; name: string }, input: ConstructionLogCreateInput) => {
  await getOwnedProjectRecord(ownerId, projectId); await ensureMilestone(projectId, input.milestoneId);
  const { assets, ...fields } = input;
  return prisma.constructionLog.create({
    data: { ...fields, logDate: date(fields.logDate), projectId, authorId: author.id, authorName: author.name, assets: assets?.length ? { create: assets.map((asset, position) => ({ ...asset, position: asset.position ?? position })) } : undefined },
    include: { assets: { orderBy: { position: 'asc' } } },
  });
};

export const getLog = ownedLog;

export const updateLog = async (ownerId: string, projectId: string, logId: string, input: ConstructionLogUpdateInput) => {
  await ownedLog(ownerId, projectId, logId); await ensureMilestone(projectId, input.milestoneId);
  const { assets, logDate, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    await tx.constructionLog.update({ where: { id: logId }, data: { ...fields, logDate: logDate ? date(logDate) : undefined } });
    if (assets !== undefined) {
      await tx.constructionLogAsset.deleteMany({ where: { logId } });
      if (assets.length) await tx.constructionLogAsset.createMany({ data: assets.map((asset, position) => ({ ...asset, logId, position: asset.position ?? position })) });
    }
    return tx.constructionLog.findUniqueOrThrow({ where: { id: logId }, include: { assets: { orderBy: { position: 'asc' } } } });
  });
};

export const deleteLog = async (ownerId: string, projectId: string, logId: string) => {
  await ownedLog(ownerId, projectId, logId);
  await prisma.constructionLog.update({ where: { id: logId }, data: { deletedAt: new Date() } });
};

const ownedAsset = async (ownerId: string, projectId: string, assetId: string) => {
  await getOwnedProjectRecord(ownerId, projectId);
  const asset = await prisma.projectAsset.findFirst({ where: { id: assetId, projectId, deletedAt: null } });
  if (!asset) throw new AppError('Project asset not found', 404, true, ErrorCodes.PROJECT_ASSET_NOT_FOUND);
  return asset;
};

export const listAssets = async (ownerId: string, projectId: string, query: Record<string, unknown>) => {
  await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query); const where = { projectId, deletedAt: null };
  const [items, total] = await Promise.all([prisma.projectAsset.findMany({ where, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), prisma.projectAsset.count({ where })]);
  return { items, pagination: meta(page, pageSize, total) };
};
export const getAsset = ownedAsset;
export const createAsset = async (ownerId: string, projectId: string, input: ProjectAssetInput) => { await getOwnedProjectRecord(ownerId, projectId); await ensureMilestone(projectId, input.milestoneId); return prisma.projectAsset.create({ data: { ...input, projectId } }); };
export const updateAsset = async (ownerId: string, projectId: string, assetId: string, input: Partial<ProjectAssetInput>) => { await ownedAsset(ownerId, projectId, assetId); await ensureMilestone(projectId, input.milestoneId); return prisma.projectAsset.update({ where: { id: assetId }, data: input }); };
export const deleteAsset = async (ownerId: string, projectId: string, assetId: string) => { await ownedAsset(ownerId, projectId, assetId); await prisma.projectAsset.update({ where: { id: assetId }, data: { deletedAt: new Date() } }); };

const ownedReport = async (ownerId: string, projectId: string, reportId: string) => {
  await getOwnedProjectRecord(ownerId, projectId); const report = await prisma.contractorReport.findFirst({ where: { id: reportId, projectId, deletedAt: null } });
  if (!report) throw new AppError('Contractor report not found', 404, true, ErrorCodes.CONTRACTOR_REPORT_NOT_FOUND); return report;
};
export const listReports = async (ownerId: string, projectId: string, query: Record<string, unknown>) => { await getOwnedProjectRecord(ownerId, projectId); const { page, pageSize } = pagination(query); const where = { projectId, deletedAt: null }; const [items, total] = await Promise.all([prisma.contractorReport.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.contractorReport.count({ where })]); return { items, pagination: meta(page, pageSize, total) }; };
export const getReport = ownedReport;
export const createReport = async (ownerId: string, projectId: string, input: ContractorReportCreateInput) => { await getOwnedProjectRecord(ownerId, projectId); return prisma.contractorReport.create({ data: { ...input, projectId } }); };
export const updateReport = async (ownerId: string, projectId: string, reportId: string, input: ContractorReportUpdateInput) => { await ownedReport(ownerId, projectId, reportId); return prisma.contractorReport.update({ where: { id: reportId }, data: input }); };
export const deleteReport = async (ownerId: string, projectId: string, reportId: string) => { await ownedReport(ownerId, projectId, reportId); await prisma.contractorReport.update({ where: { id: reportId }, data: { deletedAt: new Date() } }); };
