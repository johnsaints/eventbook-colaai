import { z } from 'zod';

const COVER_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_COVER_IMAGE_LENGTH = 1_400_000;

function hasMatchingImageSignature(mimeSubtype: string, bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (mimeSubtype === 'jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeSubtype === 'png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (mimeSubtype === 'webp') {
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export function isValidEventCoverImage(value: string): boolean {
  if (value.length > MAX_COVER_IMAGE_LENGTH) return false;
  const match = COVER_IMAGE_PATTERN.exec(value);
  if (!match) return false;
  const [, mimeSubtype, base64Body] = match;
  const headerBytes = Buffer.from(base64Body.slice(0, 24), 'base64');
  return hasMatchingImageSignature(mimeSubtype, headerBytes);
}

const coverImageSchema = z
  .string()
  .refine(isValidEventCoverImage, {
    message: 'A imagem de capa deve ser PNG, JPEG ou WebP válida de até 1 MB.',
  })
  .nullable()
  .optional();

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(100).optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres'),
  description: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres'),
  location: z.string().min(3, 'O local é obrigatório'),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  capacity: z.coerce.number().int().positive('A capacidade deve ser maior que zero'),
  coverImage: coverImageSchema,
});

export const updateEventSchema = createEventSchema.partial();

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
