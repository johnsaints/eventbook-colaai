import type { Event, Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError.js';

type LockedEvent = Pick<Event, 'organizerId' | 'startsAt' | 'endsAt' | 'capacity' | 'status'>;

export async function lockEventForWrite(tx: Prisma.TransactionClient, eventId: string) {
  const [event] = await tx.$queryRaw<LockedEvent[]>`
    SELECT organizerId, startsAt, endsAt, capacity, status FROM events
    WHERE id = ${eventId} FOR UPDATE
  `;

  if (!event) {
    throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
  }

  return event;
}
