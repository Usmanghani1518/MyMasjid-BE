import { Prisma } from '@/generated/prisma/client';
import { RegistrationStatus } from '@/generated/prisma/enums';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { parsePagination, buildPaginationMeta, Paginated, toOrderBy } from '@/utils/pagination';
import { audit, AuditActions } from '@/services/audit.service';
import { sendApplicationApprovedEmail, sendApplicationDeniedEmail } from '@/services/email.service';
import { toSafeMasjid, toSafeTrustee } from '@/modules/masjids/masjid.service';

const STATUS_FILTERS: string[] = ['PENDING_REVIEW', 'APPROVED', 'DENIED', 'DRAFT'];

export interface AdminContext {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  ipAddress?: string;
  userAgent?: string;
}

/** GET /admin/compliance/applications — paginated, filterable, sortable. */
export const listApplications = async (
  query: Record<string, unknown>,
  ctx: AdminContext,
): Promise<Paginated<unknown>> => {
  const pagination = parsePagination(query, ['createdAt', 'updatedAt', 'submittedAt', 'name']);
  const status = typeof query.status === 'string' && STATUS_FILTERS.includes(query.status) ? query.status : undefined;
  const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;

  const where: Prisma.MasjidWhereInput = {
    deletedAt: null,
    ...(status ? { status: status as RegistrationStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { owner: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.masjid.count({ where }),
    prisma.masjid.findMany({
      where,
      orderBy: toOrderBy(pagination),
      skip: pagination.skip,
      take: pagination.limit,
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
        organizationType: true,
        status: true,
        submittedAt: true,
        email: true,
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { trustees: true, documents: true } },
      },
    }),
  ]);

  void audit({
    action: AuditActions.ADMIN_LISTED,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
    entityType: 'Masjid',
    metadata: { status, search, page: pagination.page, limit: pagination.limit },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    items: items.map((m) => ({
      id: m.id,
      name: m.name,
      city: m.city,
      country: m.country,
      organizationType: m.organizationType,
      status: m.status,
      submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null,
      contactEmail: m.email,
      owner: m.owner,
      trusteeCount: m._count.trustees,
      documentCount: m._count.documents,
    })),
    meta: buildPaginationMeta(total, pagination),
  };
};

const getApplicationOrThrow = async (id: string) => {
  const masjid = await prisma.masjid.findUnique({
    where: { id },
    include: { trustees: true, documents: true, owner: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!masjid || masjid.deletedAt) {
    throw new AppError('Application not found', 404, true, ErrorCodes.NOT_FOUND);
  }
  return masjid;
};

/** GET /admin/compliance/applications/:id — full detail with masked sensitive fields. */
export const getApplication = async (id: string, ctx: AdminContext): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await getApplicationOrThrow(id);

  void audit({
    action: AuditActions.ADMIN_VIEWED,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
    entityType: 'Masjid',
    entityId: masjid.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return toSafeMasjid(masjid);
};

/** POST /admin/compliance/applications/:id/approve. */
export const approveApplication = async (
  id: string,
  ctx: AdminContext,
): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await getApplicationOrThrow(id);
  if (masjid.status !== RegistrationStatus.PENDING_REVIEW) {
    throw new AppError('Only pending applications can be approved', 409, true, ErrorCodes.REGISTRATION_NOT_PENDING);
  }

  const updated = await prisma.masjid.update({
    where: { id: masjid.id },
    data: { status: RegistrationStatus.APPROVED, reviewedAt: new Date(), reviewedBy: ctx.actorId, reviewNote: null },
    include: { trustees: true, documents: true, owner: { select: { id: true, email: true, name: true, role: true } } },
  });

  void audit({
    action: AuditActions.ADMIN_APPROVED,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { masjidName: masjid.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  await sendApplicationApprovedEmail(masjid.owner.email, { masjidName: masjid.name });

  return toSafeMasjid(updated);
};

export interface DenyReasonInput {
  field?: string;
  code: string;
  message: string;
}

/** POST /admin/compliance/applications/:id/deny — structured reasons stored + emailed. */
export const denyApplication = async (
  id: string,
  ctx: AdminContext,
  input: { reasons: DenyReasonInput[]; note?: string },
): Promise<ReturnType<typeof toSafeMasjid>> => {
  const masjid = await getApplicationOrThrow(id);
  if (masjid.status !== RegistrationStatus.PENDING_REVIEW) {
    throw new AppError('Only pending applications can be denied', 409, true, ErrorCodes.REGISTRATION_NOT_PENDING);
  }

  const updated = await prisma.masjid.update({
    where: { id: masjid.id },
    data: {
      status: RegistrationStatus.DENIED,
      reviewedAt: new Date(),
      reviewedBy: ctx.actorId,
      denialReasons: input.reasons as unknown as Prisma.InputJsonValue,
      reviewNote: input.note ?? null,
    },
    include: { trustees: true, documents: true, owner: { select: { id: true, email: true, name: true, role: true } } },
  });

  void audit({
    action: AuditActions.ADMIN_DENIED,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
    entityType: 'Masjid',
    entityId: masjid.id,
    metadata: { masjidName: masjid.name, reasonCount: input.reasons.length, reasons: input.reasons },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  await sendApplicationDeniedEmail(masjid.owner.email, {
    masjidName: masjid.name,
    reasons: input.reasons,
    note: input.note,
  });

  return toSafeMasjid(updated);
};

export { toSafeTrustee };
