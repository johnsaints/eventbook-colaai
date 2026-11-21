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

type LotMetric = {
  totalQuantity: number;
  soldQuantity: number;
  reservedQty: number;
  active: boolean;
  salesStartsAt: Date;
  salesEndsAt: Date;
};

function summarizeEventLots(lots: LotMetric[], now: Date) {
  let soldTickets = 0;
  let demandTickets = 0;
  let availableTickets = 0;

  for (const lot of lots) {
    soldTickets += lot.soldQuantity;
    demandTickets += lot.soldQuantity + lot.reservedQty;
    if (lot.active && lot.salesStartsAt <= now && lot.salesEndsAt >= now) {
      availableTickets += Math.max(0, lot.totalQuantity - lot.soldQuantity - lot.reservedQty);
    }
  }

  return { soldTickets, demandTickets, availableTickets };
}

function resolveHighlightTag({
  featured,
  capacity,
  demandTickets,
  availableTickets,
}: {
  featured: boolean;
  capacity: number;
  demandTickets: number;
  availableTickets: number;
}) {
  if (availableTickets > 0 && capacity > 0 && demandTickets / capacity >= 0.75) {
    return 'Últimos ingressos';
  }
  if (featured) return 'Destaque oficial';
  if (demandTickets >= 200) return 'Mais procurado';
  if (capacity >= 500) return 'Grande evento';
  return 'Em destaque';
}

const publicEventInclude = {
  organizer: {
    select: { id: true, name: true },
  },
  lots: {
    select: {
      totalQuantity: true,
      soldQuantity: true,
      reservedQty: true,
      active: true,
      salesStartsAt: true,
      salesEndsAt: true,
    },
  },
} as const;

export class EventsService {
  async listPublished(query: ListEventsQuery) {
    const { page, limit, q, sort } = query;
    const skip = (page - 1) * limit;
    const now = new Date();
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

    if (sort === 'soonest') {
      const [items, total] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          skip,
          take: limit,
          include: publicEventInclude,
        }),
        prisma.event.count({ where }),
      ]);

      return {
        data: items.map(({ lots, ...event }) => {
          const { soldTickets, availableTickets } = summarizeEventLots(lots, now);
          return { ...event, soldTickets, availableTickets };
        }),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const allItems = await prisma.event.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: publicEventInclude,
    });

    const enriched = allItems
      .map(({ lots, ...event }) => {
        const metrics = summarizeEventLots(lots, now);
        return { event, metrics };
      })
      .sort((a, b) => {
        if (sort === 'popular') {
          return (
            b.metrics.demandTickets - a.metrics.demandTickets ||
            b.event.capacity - a.event.capacity ||
            a.event.startsAt.getTime() - b.event.startsAt.getTime() ||
            a.event.id.localeCompare(b.event.id)
          );
        }
        return (
          b.event.capacity - a.event.capacity ||
          b.metrics.demandTickets - a.metrics.demandTickets ||
          a.event.startsAt.getTime() - b.event.startsAt.getTime() ||
          a.event.id.localeCompare(b.event.id)
        );
      });

    const total = enriched.length;
    const paged = enriched.slice(skip, skip + limit).map(({ event, metrics }) => ({
      ...event,
      soldTickets: metrics.soldTickets,
      availableTickets: metrics.availableTickets,
    }));

    return {
      data: paged,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listHighlights(limit = 5) {
    const now = new Date();
    const candidates = await prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        startsAt: { gt: now },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: publicEventInclude,
    });

    const mapped = candidates.map(({ lots, ...event }) => {
      const metrics = summarizeEventLots(lots, now);
      return {
        ...event,
        soldTickets: metrics.soldTickets,
        availableTickets: metrics.availableTickets,
        demandTickets: metrics.demandTickets,
        highlightTag: resolveHighlightTag({
          featured: event.featured,
          capacity: event.capacity,
          demandTickets: metrics.demandTickets,
          availableTickets: metrics.availableTickets,
        }),
      };
    });

    const activePool = mapped.some((item) => item.availableTickets > 0)
      ? mapped.filter((item) => item.availableTickets > 0)
      : mapped;

    return activePool
      .sort((a, b) => (
        Number(b.featured) - Number(a.featured) ||
        b.demandTickets - a.demandTickets ||
        b.capacity - a.capacity ||
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.id.localeCompare(b.id)
      ))
      .slice(0, limit)
      .map(({ demandTickets: _demandTickets, ...publicEvent }) => publicEvent);
  }

  async listMine(requester: { id: string; role: Role } | string) {
    const requesterId = typeof requester === 'string' ? requester : requester.id;
    const isAdmin = typeof requester === 'object' && requester.role === Role.ADMIN;

    if (!requesterId) {
      throw new AppError('UNAUTHORIZED', 'Usuário não autenticado', 401);
    }

    const events = await prisma.event.findMany({
      where: isAdmin ? {} : { organizerId: requesterId },
      select: {
        id: true,
        title: true,
        location: true,
        startsAt: true,
        status: true,
        featured: true,
        capacity: true,
        _count: {
          select: {
            orders: true,
            tickets: true,
          },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    return events.map(({ _count, ...event }) => ({
      ...event,
      hasSales: _count.orders > 0 || _count.tickets > 0,
    }));
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
        coverImage: data.coverImage ?? null,
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

    if (event.status === EventStatus.CANCELLED) {
      throw new AppError('EVENT_ARCHIVED', 'Eventos arquivados não podem ser publicados.', 422);
    }

    // RN-01: Evento passado não pode ser editado/publicado e requer lotes
    assertEventNotInPast(event.startsAt);
    assertEventHasLotsForPublish(event._count.lots);

    return prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
    });
  }

  async unpublish(eventId: string, requester: { id: string; role: Role }) {
    return prisma.$transaction(async (tx) => {
      const event = await lockEventForWrite(tx, eventId);

      if (requester.role !== Role.ADMIN && event.organizerId !== requester.id) {
        throw new AppError('FORBIDDEN', 'Sem permissão para ocultar este evento', 403);
      }

      if (event.status === EventStatus.CANCELLED) {
        throw new AppError('EVENT_ARCHIVED', 'Eventos arquivados não podem ser ocultados.', 422);
      }

      return tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.DRAFT, featured: false },
      });
    }, { isolationLevel: 'ReadCommitted' });
  }

  async removeOrArchive(eventId: string, requester: { id: string; role: Role }) {
    return prisma.$transaction(async (tx) => {
      const event = await lockEventForWrite(tx, eventId);

      if (requester.role !== Role.ADMIN && event.organizerId !== requester.id) {
        throw new AppError('FORBIDDEN', 'Sem permissão para remover este evento', 403);
      }

      const [ordersCount, ticketsCount] = await Promise.all([
        tx.order.count({ where: { eventId } }),
        tx.ticket.count({ where: { eventId } }),
      ]);

      if (ordersCount === 0 && ticketsCount === 0) {
        await tx.event.delete({ where: { id: eventId } });
        return {
          action: 'DELETED' as const,
          id: eventId,
          message: 'Evento excluído permanentemente.',
        };
      }

      const updated = await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.CANCELLED, featured: false },
      });

      return {
        action: 'ARCHIVED' as const,
        id: eventId,
        event: updated,
        message: 'Evento arquivado para preservar o histórico de pedidos e ingressos.',
      };
    }, { isolationLevel: 'ReadCommitted' });
  }

  async setFeatured(
    eventId: string,
    requester: { id: string; role: Role },
    featured: boolean
  ) {
    if (requester.role !== Role.ADMIN) {
      throw new AppError('FORBIDDEN', 'Apenas administradores podem destacar eventos.', 403);
    }

    const existing = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    }

    return prisma.event.update({
      where: { id: eventId },
      data: { featured },
      select: {
        id: true,
        title: true,
        location: true,
        startsAt: true,
        status: true,
        featured: true,
        capacity: true,
      },
    });
  }
}