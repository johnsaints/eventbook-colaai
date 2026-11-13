import { z } from 'zod';

const numericInput = z.union([z.number(), z.string().trim().min(1)]);
const isoDate = z.string().datetime().transform((value) => new Date(value));

const lotFields = z.object({
  name: z.string().trim().min(3).max(191),
  price: numericInput.pipe(z.coerce.number<string | number>().min(0).max(99_999_999.99).multipleOf(0.01)),
  quantity: numericInput.pipe(z.coerce.number<string | number>().int().min(1).max(2_147_483_647)),
  salesStartAt: isoDate,
  salesEndAt: isoDate,
  active: z.boolean(),
});

const salesOrderError = {
  message: 'O fim das vendas deve ser posterior ao início.',
  path: ['salesEndAt'],
};

export const createLotSchema = lotFields
  .extend({ active: z.boolean().default(true) })
  .refine(({ salesStartAt, salesEndAt }) => salesEndAt > salesStartAt, salesOrderError);

export const updateLotSchema = lotFields.partial().refine(
  ({ salesStartAt, salesEndAt }) => !salesStartAt || !salesEndAt || salesEndAt > salesStartAt,
  salesOrderError
);

export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
