import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';

function occupancyMetrics(totalTickets: number, soldTickets: number, checkIns: number) {
  const occupancyPercentage = totalTickets === 0
    ? 0
    : Math.round((checkIns * 10_000) / totalTickets) / 100;

  return { totalTickets, soldTickets, checkIns, occupancyPercentage };
}

export async function getEventOccupancy(eventId: string, requesterId: string) {
  return prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, organizer: { select: { role: true } } },
    });
    if (!event) throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    if (event.organizerId !== requesterId || event.organizer.role !== Role.ORGANIZER) {
      throw new AppError('FORBIDDEN', 'Você não pode consultar a ocupação deste evento.', 403);
    }

    const { _sum } = await tx.ticketLot.aggregate({
      where: { eventId },
      _sum: { totalQuantity: true, soldQuantity: true },
    });
    const checkIns = await tx.checkIn.count({
      where: { ticket: { eventId, lot: { eventId } } },
    });
    const lots = await tx.ticketLot.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        totalQuantity: true,
        soldQuantity: true,
        _count: { select: { tickets: { where: { eventId, checkIn: { isNot: null } } } } },
      },
    });

    return {
      eventId,
      totals: occupancyMetrics(_sum.totalQuantity ?? 0, _sum.soldQuantity ?? 0, checkIns),
      lots: lots.map(lot => ({
        id: lot.id,
        name: lot.name,
        ...occupancyMetrics(lot.totalQuantity, lot.soldQuantity, lot._count.tickets),
      })),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
