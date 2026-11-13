import { Prisma, Role, TicketStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { lockEventForWrite } from '../events/events.repository.js';

const opensBeforeEventMs = 2 * 60 * 60_000;

function ticketAlreadyUsed() {
  return new AppError('TICKET_ALREADY_USED', 'Este ingresso já foi utilizado.', 409);
}

export async function checkInTicket(eventId: string, code: string, staffId: string) {
  return prisma.$transaction(async tx => {
    const event = await lockEventForWrite(tx, eventId);
    const assignment = await tx.eventStaff.findFirst({
      where: { eventId, userId: staffId, user: { role: Role.STAFF } },
      select: { id: true },
    });
    if (!assignment) {
      throw new AppError('FORBIDDEN', 'Você não integra a equipe deste evento.', 403);
    }

    const ticket = await tx.ticket.findUnique({
      where: { code },
      select: { id: true, eventId: true, status: true, checkIn: { select: { id: true } } },
    });
    if (!ticket) throw new AppError('TICKET_NOT_FOUND', 'Ingresso não encontrado.', 404);
    if (ticket.eventId !== eventId) {
      throw new AppError('TICKET_WRONG_EVENT', 'Este ingresso pertence a outro evento.', 422);
    }
    if (ticket.status === TicketStatus.CANCELLED) {
      throw new AppError('TICKET_INVALID', 'Este ingresso foi cancelado.', 422);
    }
    if (ticket.status === TicketStatus.USED || ticket.checkIn) throw ticketAlreadyUsed();

    const now = new Date();
    const opensAt = event.startsAt.getTime() - opensBeforeEventMs;
    if (now.getTime() < opensAt || now > event.endsAt) {
      throw new AppError('CHECKIN_WINDOW_CLOSED', 'O check-in está fora do horário permitido.', 422);
    }

    const used = await tx.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.VALID },
      data: { status: TicketStatus.USED, usedAt: now },
    });
    if (used.count !== 1) throw ticketAlreadyUsed();

    try {
      const checkIn = await tx.checkIn.create({
        data: { ticketId: ticket.id, staffId, checkedInAt: now },
        select: { id: true, ticketId: true, checkedInAt: true },
      });
      return { ...checkIn, eventId, status: TicketStatus.USED };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ticketAlreadyUsed();
      }
      throw error;
    }
  }, { isolationLevel: 'ReadCommitted' });
}
