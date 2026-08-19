import { describe, it, expect } from 'vitest';
import { parsePagination, toOrderBy, buildPaginationMeta } from '@/utils/pagination';

describe('pagination', () => {
  it('applies defaults when no query params are provided', () => {
    const p = parsePagination({});
    expect(p).toMatchObject({ page: 1, limit: 20, skip: 0, sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('parses and coerces page/limit/sort', () => {
    const p = parsePagination(
      { page: '3', limit: '50', sortBy: 'submittedAt', sortOrder: 'asc' },
      ['createdAt', 'updatedAt', 'submittedAt'],
    );
    expect(p).toMatchObject({ page: 3, limit: 50, skip: 100, sortBy: 'submittedAt', sortOrder: 'asc' });
  });

  it('caps the limit at the maximum', () => {
    expect(() => parsePagination({ limit: '9999' })).toThrow();
  });

  it('rejects invalid sort fields (orderBy injection guard)', () => {
    expect(() => parsePagination({ sortBy: 'password' }, ['createdAt', 'name'])).toThrow(/Invalid sortBy/);
    expect(() => parsePagination({ sortBy: 'createdAt' }, ['createdAt'])).not.toThrow();
  });

  it('builds orderBy from parsed pagination', () => {
    const p = parsePagination({ sortBy: 'name', sortOrder: 'asc' }, ['name']);
    expect(toOrderBy(p)).toEqual({ name: 'asc' });
  });

  it('builds pagination metadata', () => {
    const p = parsePagination({ page: 2, limit: 10 });
    expect(buildPaginationMeta(25, p)).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(buildPaginationMeta(0, p)).toEqual({ page: 2, limit: 10, total: 0, totalPages: 0 });
  });
});
