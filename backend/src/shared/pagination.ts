import { z } from 'zod';

const integerParam = z.string().regex(/^\d+$/).transform(Number);

export const paginationQuerySchema = z.object({
  page: integerParam.pipe(z.number().int().min(1).max(2_147_483_647)).default(1),
  limit: integerParam.pipe(z.number().int().min(1).max(50)).default(10),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function toPage<T>(data: T[], total: number, { page, limit }: PaginationQuery) {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
