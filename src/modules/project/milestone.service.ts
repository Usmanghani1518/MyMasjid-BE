import { prisma } from '@/config/database';
import { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { getOwnedProjectRecord } from './project.service';
import type { MilestoneCreateInput, MilestoneProgressUpdateInput, MilestoneUpdateInput } from './milestone.schemas';

const date = (value: string | null | undefined, end = false) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);

const milestoneData = (input: MilestoneCreateInput | MilestoneUpdateInput) => ({
  ...input,
  plannedStartDate: date(input.plannedStartDate),
  dueDate: date(input.dueDate, true),
  completedAt: input.completedAt === undefined ? undefined : input.completedAt === null ? null : new Date(input.completedAt),
});

const ownedMilestone = async (ownerId: string, projectId: string, milestoneId: string) => {
  await getOwnedProjectRecord(ownerId, projectId);
  const milestone = await prisma.projectMilestone.findFirst({
    where: { id: milestoneId, projectId, deletedAt: null },
    include: { _count: { select: { assets: { where: { deletedAt: null } }, comments: { where: { deletedAt: null } }, updates: true } } },
  });
  if (!milestone) throw new AppError('Milestone not found', 404, true, ErrorCodes.MILESTONE_NOT_FOUND);
  return milestone;
};

const normalizeCompletion = <T extends { status?: string; progressPercent?: number; completedAt?: Date | null }>(data: T) => {
  if (data.status === 'COMPLETED') return { ...data, progressPercent: 100, completedAt: data.completedAt ?? new Date() };
  return data;
};

export const listMilestones = async (ownerId: string, projectId: string, query: Record<string, unknown>) => {
  await getOwnedProjectRecord(ownerId, projectId);
  const page = Number(query.page ?? 1); const pageSize = Number(query.pageSize ?? 20);
  const where = { projectId, deletedAt: null, status: query.status ? String(query.status) as 'COMPLETED' | 'IN_PROGRESS' | 'UPCOMING' : undefined };
  const [items, total, statusGroups] = await Promise.all([
    prisma.projectMilestone.findMany({
      where, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
      include: {
        assets: { where: { deletedAt: null }, orderBy: { position: 'asc' } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        updates: { orderBy: { createdAt: 'desc' } },
        _count: { select: { assets: { where: { deletedAt: null } }, comments: { where: { deletedAt: null } }, updates: true } },
      },
    }),
    prisma.projectMilestone.count({ where }),
    prisma.projectMilestone.groupBy({ by: ['status'], where: { projectId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(statusGroups.map((row) => [row.status, row._count._all]));
  return {
    summary: {
      total: statusGroups.reduce((sum, row) => sum + row._count._all, 0),
      completed: counts.COMPLETED ?? 0,
      inProgress: counts.IN_PROGRESS ?? 0,
      upcoming: counts.UPCOMING ?? 0,
    },
    items,
    pagination: { page, pageSize, total, totalPages: total ? Math.ceil(total / pageSize) : 0 },
  };
};

export const createMilestone = async (ownerId: string, projectId: string, input: MilestoneCreateInput) => {
  await getOwnedProjectRecord(ownerId, projectId);
  const data = normalizeCompletion(milestoneData(input));
  return prisma.projectMilestone.create({ data: { ...data, projectId } as Prisma.ProjectMilestoneUncheckedCreateInput, include: { _count: { select: { assets: true, comments: true, updates: true } } } });
};

export const getMilestone = ownedMilestone;

export const updateMilestone = async (ownerId: string, projectId: string, milestoneId: string, input: MilestoneUpdateInput) => {
  const current = await ownedMilestone(ownerId, projectId, milestoneId);
  const data = normalizeCompletion(milestoneData(input));
  if (data.plannedStartDate && data.dueDate && data.dueDate < data.plannedStartDate) throw new AppError('Due date cannot be before planned start date', 400, true, ErrorCodes.INVALID_PROJECT_DATES);
  if ((data.plannedStartDate ?? current.plannedStartDate) && (data.dueDate ?? current.dueDate) && (data.dueDate ?? current.dueDate)! < (data.plannedStartDate ?? current.plannedStartDate)!) throw new AppError('Due date cannot be before planned start date', 400, true, ErrorCodes.INVALID_PROJECT_DATES);
  return prisma.projectMilestone.update({ where: { id: milestoneId }, data, include: { _count: { select: { assets: { where: { deletedAt: null } }, comments: { where: { deletedAt: null } }, updates: true } } } });
};

export const deleteMilestone = async (ownerId: string, projectId: string, milestoneId: string) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { deletedAt: new Date() } });
};

export const submitMilestoneUpdate = async (ownerId: string, projectId: string, milestoneId: string, author: { id: string; name: string }, input: MilestoneProgressUpdateInput) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  return prisma.$transaction(async (tx) => {
    const update = await tx.milestoneUpdate.create({ data: { milestoneId, authorId: author.id, authorName: author.name, ...input } });
    if (input.progressPercent !== undefined || input.status !== undefined) {
      const data = normalizeCompletion({ progressPercent: input.progressPercent, status: input.status });
      await tx.projectMilestone.update({ where: { id: milestoneId }, data });
    }
    return update;
  });
};

export const listMilestoneUpdates = async (ownerId: string, projectId: string, milestoneId: string) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  return prisma.milestoneUpdate.findMany({ where: { milestoneId }, orderBy: { createdAt: 'desc' } });
};

export const listComments = async (ownerId: string, projectId: string, milestoneId: string) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  return prisma.milestoneComment.findMany({ where: { milestoneId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
};

export const createComment = async (ownerId: string, projectId: string, milestoneId: string, author: { id: string; name: string }, body: string) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  return prisma.milestoneComment.create({ data: { milestoneId, authorId: author.id, authorName: author.name, body } });
};

const ownedComment = async (ownerId: string, projectId: string, milestoneId: string, commentId: string) => {
  await ownedMilestone(ownerId, projectId, milestoneId);
  const comment = await prisma.milestoneComment.findFirst({ where: { id: commentId, milestoneId, deletedAt: null } });
  if (!comment) throw new AppError('Milestone comment not found', 404, true, ErrorCodes.MILESTONE_COMMENT_NOT_FOUND);
  return comment;
};

export const updateComment = async (ownerId: string, projectId: string, milestoneId: string, commentId: string, body: string) => {
  await ownedComment(ownerId, projectId, milestoneId, commentId);
  return prisma.milestoneComment.update({ where: { id: commentId }, data: { body } });
};

export const deleteComment = async (ownerId: string, projectId: string, milestoneId: string, commentId: string) => {
  await ownedComment(ownerId, projectId, milestoneId, commentId);
  await prisma.milestoneComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
};
