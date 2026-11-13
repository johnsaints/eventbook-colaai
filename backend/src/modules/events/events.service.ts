import { EventStatus, Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import {
  assertEventHasLotsForPublish,
  assertEventNotInPast,
  assertValidEventDates,
} from './events.rules.js';
import {
  CreateEventInput,
  ListEventsQuery,
  UpdateEventInput,
} from './events.schema.js';
import { lockEventForWrite } from './events.repository.js';

export class EventsService {
  async listPublished(query: ListEventsQuery) {
    const { page, limit, q } = query;
    const skip = (page - 1) * limit;
    const search = q && q.length > 0 ? q : undefined;
    const where = {
      status: EventStatus.PUBLISHED,
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { location: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take: limit,
        include: {
          organizer: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listMine(organizerId: string) {
    if (!organizerId) {
      throw new AppError('UNAUTHORIZED', 'Usuário não autenticado', 401);
    }

    return prisma.event.findMany({
      where: { organizerId },
      select: {
        id: true,
        title: true,
        location: true,
        startsAt: true,
        status: true,
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }
  
  async getById(eventId: string, requester?: { id: string; role: Role }) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizer: {
          select: { id: true, name: true },
        },
        lots: {
          orderBy: { salesStartsAt: 'asc' },
        },
      },
    });

    if (!event) {
      throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    }

    const isOwnerOrAdmin =
      requester?.role === Role.ADMIN || requester?.id === event.organizerId;

    if (event.status !== EventStatus.PUBLISHED && !isOwnerOrAdmin) {
      throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    }

    const now = new Date();
    const visibleLots = isOwnerOrAdmin
      ? event.lots
      : event.lots.filter(
          (lot) =>
            lot.active &&
            lot.salesStartsAt <= now &&
            lot.salesEndsAt >= now &&
            lot.soldQuantity + lot.reservedQty < lot.totalQuantity
        );

    return {
      ...event,
      lots: visibleLots,
    };
  }

  async create(organizerId: string, data: CreateEventInput) {
    assertValidEventDates(data.startsAt, data.endsAt);

    return prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        capacity: data.capacity,
        status: EventStatus.DRAFT,
        organizerId,
      },
    });
  }

    async update(
    eventId: string,
    requester: { id: string; role: Role },
    data: UpdateEventInput
  ) {
    return prisma.$transaction(async (tx) => {
      const event = await lockEventForWrite(tx, eventId);

      if (requester.role !== Role.ADMIN && event.organizerId !== requester.id) {
        throw new AppError('FORBIDDEN', 'Sem permissão para editar este evento', 403);
      }

      assertEventNotInPast(event.startsAt);

      const nextStartsAt = data.startsAt ?? event.startsAt;
      const nextEndsAt = data.endsAt ?? event.endsAt;
      assertValidEventDates(nextStartsAt, nextEndsAt);

      if (data.capacity !== undefined || data.endsAt !== undefined) {
        const { _sum, _max } = await tx.ticketLot.aggregate({
          where: { eventId },
          _sum: { totalQuantity: true },
          _max: { salesEndsAt: true },
        });

        if (data.capacity !== undefined && data.capacity < (_sum.totalQuantity ?? 0)) {
          throw new AppError(
            'LOT_CAPACITY_EXCEEDED',
            'A capacidade precisa cobrir a quantidade dos lotes já cadastrados.',
            422
          );
        }

        if (data.endsAt && _max.salesEndsAt && data.endsAt < _max.salesEndsAt) {
          throw new AppError(
            'INVALID_SALE_WINDOW',
            'O evento não pode terminar antes do fim das vendas dos lotes.',
            422
          );
        }
      }

      return tx.event.update({ where: { id: eventId }, data });
    }, { isolationLevel: 'ReadCommitted' });
  }

  async publish(eventId: string, requester: { id: string; role: Role }) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: { lots: true },
        },
      },
    });

    if (!event) {
      throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    }

    if (requester.role !== Role.ADMIN && event.organizerId !== requester.id) {
      throw new AppError('FORBIDDEN', 'Sem permissão para publicar este evento', 403);
    }

    // RN-01: Evento passado não pode ser editado/publicado e requer lotes
    assertEventNotInPast(event.startsAt);
    assertEventHasLotsForPublish(event._count.lots);

    return prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
    });
  }
}