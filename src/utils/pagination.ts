import { z } from 'zod';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';


export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});





export const parsePagination = (
  query: Record<string, unknown>,
  allowedSortFields: string[] = ['createdAt', 'updatedAt'],
): PaginationInput => {
  const parsed = paginationSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError('Invalid pagination parameters', 400);
  }

  const { page, limit, sortBy, sortOrder } = parsed.data;

  if (!allowedSortFields.includes(sortBy)) {
    throw new AppError(`Invalid sortBy field. Allowed: ${allowedSortFields.join(', ')}`, 400);
  }

  return { page, limit, skip: (page - 1) * limit, sortBy, sortOrder };
};


export const toOrderBy = (pagination: PaginationInput): Record<string, 'asc' | 'desc'> => ({
  [pagination.sortBy]: pagination.sortOrder,
});

export const buildPaginationMeta = (total: number, pagination: PaginationInput): PaginationMeta => ({
  page: pagination.page,
  limit: pagination.limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
});


export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export const notFoundError = (resource: string): AppError =>
  new AppError(`${resource} not found`, 404, true, ErrorCodes.NOT_FOUND);
