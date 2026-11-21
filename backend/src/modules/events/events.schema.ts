import { z } from 'zod';
import { createOptionalImageDataUrlSchema } from '../../shared/validation/imageDataUrl.js';

const coverImageSchema = createOptionalImageDataUrlSchema({
  maxLength: 1_400_000,
  message: 'A imagem de capa deve ser PNG, JPEG ou WebP válida de até 1 MB.',
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['soonest', 'popular', 'largest']).default('soonest'),
});

export const highlightsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const createEventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres'),
  description: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres'),
  location: z.string().min(3, 'O local é obrigatório'),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  capacity: z.coerce.number().int().positive('A capacidade deve ser maior que zero'),
  coverImage: coverImageSchema,
  attachDefaultTeam: z.boolean().optional().default(true),
});

export const updateEventSchema = createEventSchema.omit({ attachDefaultTeam: true }).partial();

export const setFeaturedSchema = z.object({
  featured: z.boolean(),
}).strict();

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type HighlightsQuery = z.infer<typeof highlightsQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type SetFeaturedInput = z.infer<typeof setFeaturedSchema>;
