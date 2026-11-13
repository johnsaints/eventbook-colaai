import { z } from 'zod';

const uuid = z.guid().transform(value => value.toLowerCase());

export const orderParamsSchema = z.object({ id: uuid });

const orderItemSchema = z.object({
  lotId: uuid,
  quantity: z.number().int().positive().max(2_147_483_647),
}).strict();

export const createOrderSchema = z.object({
  eventId: uuid,
  items: z.array(orderItemSchema).min(1).refine(
    items => new Set(items.map(item => item.lotId)).size === items.length,
    'Informe cada lote apenas uma vez.'
  ),
}).strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
