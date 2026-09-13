import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import type { CampaignInput } from './campaign.schemas';

const getMasjidId = async (ownerId: string) => {
  const masjid = await prisma.masjid.findFirst({ where: { ownerId, deletedAt: null, isActive: true }, select: { id: true } });
  if (!masjid) throw new AppError('No active Masjid belongs to this account', 403, true, ErrorCodes.FORBIDDEN);
  return masjid.id;
};

export const ensureMasjidOwner = getMasjidId;

const toData = (input: CampaignInput) => ({
  ...input,
  goal: input.goal === undefined ? undefined : input.goal,
  startDate: input.startDate === undefined ? undefined : input.startDate === null ? null : new Date(`${input.startDate}T00:00:00.000Z`),
  endDate: input.endDate === undefined ? undefined : input.endDate === null ? null : new Date(`${input.endDate}T23:59:59.999Z`),
  gallery: input.gallery as Prisma.InputJsonValue | undefined,
  donationTiers: input.donationTiers as Prisma.InputJsonValue | undefined,
  faqs: input.faqs as Prisma.InputJsonValue | undefined,
});

const viewStatus = (campaign: { publicationStatus: string; startDate: Date | null; endDate: Date | null }) => {
  if (campaign.publicationStatus === 'DRAFT') return 'DRAFT';
  const now = new Date();
  if (campaign.startDate && campaign.startDate > now) return 'SCHEDULED';
  if (campaign.endDate && campaign.endDate < now) return 'COMPLETED';
  return 'ACTIVE';
};

const serialize = <T extends { goal: Prisma.Decimal | null; publicationStatus: string; startDate: Date | null; endDate: Date | null }>(campaign: T) => ({
  ...campaign,
  goal: campaign.goal === null ? null : Number(campaign.goal),
  status: viewStatus(campaign),
});

const ownedCampaign = async (ownerId: string, id: string) => {
  const masjidId = await getMasjidId(ownerId);
  const campaign = await prisma.campaign.findFirst({ where: { id, masjidId, deletedAt: null } });
  if (!campaign) throw new AppError('Campaign not found', 404, true, ErrorCodes.CAMPAIGN_NOT_FOUND);
  return campaign;
};

export const createCampaign = async (ownerId: string, input: CampaignInput) => {
  const masjidId = await getMasjidId(ownerId);
  return serialize(await prisma.campaign.create({ data: { masjidId, ...toData(input) } }));
};

export const updateCampaign = async (ownerId: string, id: string, input: CampaignInput) => {
  await ownedCampaign(ownerId, id);
  return serialize(await prisma.campaign.update({ where: { id }, data: toData(input) }));
};

export const getCampaign = async (ownerId: string, id: string) => serialize(await ownedCampaign(ownerId, id));

export const publishCampaign = async (ownerId: string, id: string) => {
  const campaign = await ownedCampaign(ownerId, id);
  const missing: string[] = [];
  for (const field of ['name', 'category', 'project', 'description', 'coverImageUrl', 'goal', 'startDate', 'endDate', 'story', 'impact'] as const) {
    if (campaign[field] === null || campaign[field] === '') missing.push(field);
  }
  const tiers = Array.isArray(campaign.donationTiers) ? campaign.donationTiers : [];
  const faqs = Array.isArray(campaign.faqs) ? campaign.faqs : [];
  if (!tiers.length) missing.push('donationTiers');
  if (faqs.some((faq) => !faq || typeof faq !== 'object' || !('question' in faq) || !('answer' in faq))) missing.push('faqs');
  if (campaign.startDate && campaign.endDate && campaign.endDate <= campaign.startDate) missing.push('endDate');
  if (missing.length) throw new AppError(`Campaign is incomplete: ${[...new Set(missing)].join(', ')}`, 400, true, ErrorCodes.CAMPAIGN_INCOMPLETE);
  return serialize(await prisma.campaign.update({ where: { id }, data: { publicationStatus: 'PUBLISHED', publishedAt: campaign.publishedAt ?? new Date() } }));
};

export const deleteCampaign = async (ownerId: string, id: string) => {
  await ownedCampaign(ownerId, id);
  await prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
};

export const listCampaigns = async (ownerId: string, query: Record<string, unknown>) => {
  const masjidId = await getMasjidId(ownerId);
  const page = Number(query.page ?? 1); const pageSize = Number(query.pageSize ?? 10);
  const where: Prisma.CampaignWhereInput = { masjidId, deletedAt: null };
  if (query.search) where.name = { contains: String(query.search), mode: 'insensitive' };
  if (query.category) where.category = String(query.category);
  if (query.startDate || query.endDate) where.startDate = { gte: query.startDate ? new Date(`${query.startDate}T00:00:00Z`) : undefined, lte: query.endDate ? new Date(`${query.endDate}T23:59:59Z`) : undefined };
  const [items, total] = await Promise.all([prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.campaign.count({ where })]);
  const status = query.status ? String(query.status) : undefined;
  const serialized = items.map(serialize).filter((item) => !status || item.status === status);
  return { items: serialized, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
};

export const calendar = async (ownerId: string) => {
  const masjidId = await getMasjidId(ownerId);
  const items = await prisma.campaign.findMany({ where: { masjidId, deletedAt: null, startDate: { not: null }, endDate: { not: null } }, orderBy: { startDate: 'asc' } });
  return items.map((item) => ({ id: item.id, title: item.name ?? 'Untitled Campaign', start: item.startDate, end: item.endDate, status: viewStatus(item), campaign: serialize(item) }));
};

export const analytics = async (ownerId: string) => {
  const masjidId = await getMasjidId(ownerId);
  const items = await prisma.campaign.findMany({ where: { masjidId, deletedAt: null }, select: { publicationStatus: true, startDate: true, endDate: true } });
  const statuses = items.map(viewStatus);
  return { totalCampaigns: items.length, draftCampaigns: statuses.filter((s) => s === 'DRAFT').length, scheduledCampaigns: statuses.filter((s) => s === 'SCHEDULED').length, activeCampaigns: statuses.filter((s) => s === 'ACTIVE').length, completedCampaigns: statuses.filter((s) => s === 'COMPLETED').length };
};
