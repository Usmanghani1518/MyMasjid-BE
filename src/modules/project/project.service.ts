import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import type { ProjectCreateInput, ProjectUpdateInput } from './project.schemas';

export const getOwnedMasjidId = async (ownerId: string) => {
  const masjid = await prisma.masjid.findFirst({
    where: { ownerId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!masjid) throw new AppError('No active Masjid belongs to this account', 403, true, ErrorCodes.FORBIDDEN);
  return masjid.id;
};

const toDate = (value: string | null | undefined, endOfDay = false) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);

const toData = (input: ProjectCreateInput | ProjectUpdateInput) => {
  const { milestones, ...projectInput } = input;
  void milestones;
  return {
    ...projectInput,
    startDate: toDate(input.startDate),
    completionDate: toDate(input.completionDate, true),
    fundingSources: input.fundingSources as Prisma.InputJsonValue | undefined,
    media: input.media as Prisma.InputJsonValue | undefined,
    complianceDocuments: input.complianceDocuments as Prisma.InputJsonValue | undefined,
  };
};

const serialize = <T extends {
  estimatedTotalCost: Prisma.Decimal | null;
  fundraisingGoal: Prisma.Decimal | null;
  seedFunding: Prisma.Decimal;
  raisedAmount: Prisma.Decimal;
}>(project: T) => ({
  ...project,
  estimatedTotalCost: project.estimatedTotalCost === null ? null : Number(project.estimatedTotalCost),
  fundraisingGoal: project.fundraisingGoal === null ? null : Number(project.fundraisingGoal),
  seedFunding: Number(project.seedFunding),
  raisedAmount: Number(project.raisedAmount),
});

export const getOwnedProjectRecord = async (ownerId: string, id: string) => {
  const masjidId = await getOwnedMasjidId(ownerId);
  const project = await prisma.project.findFirst({
    where: { id, masjidId, deletedAt: null },
    include: { milestones: { where: { deletedAt: null }, orderBy: { position: 'asc' } } },
  });
  if (!project) throw new AppError('Project not found', 404, true, ErrorCodes.PROJECT_NOT_FOUND);
  return project;
};

const validateMergedProject = (project: {
  startDate?: Date | null;
  completionDate?: Date | null;
  estimatedTotalCost?: Prisma.Decimal | number | null;
  fundraisingGoal?: Prisma.Decimal | number | null;
  seedFunding?: Prisma.Decimal | number;
}) => {
  if (project.startDate && project.completionDate && project.completionDate < project.startDate) {
    throw new AppError('Completion date cannot be before start date', 400, true, ErrorCodes.INVALID_PROJECT_DATES);
  }
  if (project.estimatedTotalCost !== null && project.estimatedTotalCost !== undefined && project.fundraisingGoal !== null && project.fundraisingGoal !== undefined && Number(project.fundraisingGoal) > Number(project.estimatedTotalCost)) {
    throw new AppError('Fundraising goal cannot exceed estimated total cost', 400, true, ErrorCodes.INVALID_PROJECT_BUDGET);
  }
  if (project.fundraisingGoal !== null && project.fundraisingGoal !== undefined && project.seedFunding !== undefined && Number(project.seedFunding) > Number(project.fundraisingGoal)) {
    throw new AppError('Seed funding cannot exceed fundraising goal', 400, true, ErrorCodes.INVALID_PROJECT_BUDGET);
  }
};

export const createProject = async (ownerId: string, input: ProjectCreateInput) => {
  const masjidId = await getOwnedMasjidId(ownerId);
  const { milestones, ...projectInput } = input;
  const data = toData(projectInput);
  validateMergedProject(data);
  return serialize(await prisma.project.create({
    data: {
      ...data,
      masjid: { connect: { id: masjidId } },
      milestones: milestones?.length ? {
        create: milestones.map((milestone, position) => ({
          name: milestone.name,
          durationWeeks: milestone.durationWeeks,
          position,
        })),
      } : undefined,
    } as Prisma.ProjectCreateInput,
    include: { milestones: { where: { deletedAt: null }, orderBy: { position: 'asc' } } },
  }));
};

export const getProject = async (ownerId: string, id: string) => serialize(await getOwnedProjectRecord(ownerId, id));

export const updateProject = async (ownerId: string, id: string, input: ProjectUpdateInput) => {
  const current = await getOwnedProjectRecord(ownerId, id);
  const { milestones, ...projectInput } = input;
  const data = toData(projectInput);
  validateMergedProject({ ...current, ...data });
  return serialize(await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data });
    if (milestones !== undefined) {
      await tx.projectMilestone.updateMany({ where: { projectId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (milestones.length) {
        await tx.projectMilestone.createMany({
          data: milestones.map((milestone, position) => ({
            projectId: id, name: milestone.name, durationWeeks: milestone.durationWeeks, position,
          })),
        });
      }
    }
    return tx.project.findUniqueOrThrow({
      where: { id },
      include: { milestones: { where: { deletedAt: null }, orderBy: { position: 'asc' } } },
    });
  }));
};

export const deleteProject = async (ownerId: string, id: string) => {
  await getOwnedProjectRecord(ownerId, id);
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
};

export const listProjects = async (ownerId: string, query: Record<string, unknown>) => {
  const masjidId = await getOwnedMasjidId(ownerId);
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 10);
  const where: Prisma.ProjectWhereInput = { masjidId, deletedAt: null };

  if (query.status) where.status = String(query.status) as 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  if (query.category) where.category = { equals: String(query.category), mode: 'insensitive' };
  if (query.search) {
    const search = String(query.search);
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ];
  }

  const sortBy = String(query.sortBy ?? 'createdAt');
  const sortOrder = String(query.sortOrder ?? 'desc') as 'asc' | 'desc';
  const [items, total] = await Promise.all([
    prisma.project.findMany({ where, orderBy: { [sortBy]: sortOrder }, skip: (page - 1) * pageSize, take: pageSize, include: { milestones: { where: { deletedAt: null }, orderBy: { position: 'asc' } } } }),
    prisma.project.count({ where }),
  ]);

  return {
    items: items.map(serialize),
    pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
  };
};

export const getProjectSummary = async (ownerId: string) => {
  const masjidId = await getOwnedMasjidId(ownerId);
  const where = { masjidId, deletedAt: null };
  const [totalProjects, grouped] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  const count = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  return {
    totalProjects,
    activeProjects: count.ACTIVE ?? 0,
    completedProjects: count.COMPLETED ?? 0,
    plannedProjects: count.PLANNED ?? 0,
  };
};
