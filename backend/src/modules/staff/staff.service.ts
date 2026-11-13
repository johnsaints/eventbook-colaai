import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { lockEventForWrite } from '../events/events.repository.js';

const memberSelect = {
  userId: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EventStaffSelect;

type Member = Prisma.EventStaffGetPayload<{ select: typeof memberSelect }>;

function toStaffMember({ user, ...assignment }: Member) {
  return { ...assignment, ...user };
}

function assertEventOwner(organizerId: string, requesterId: string) {
  if (organizerId !== requesterId) {
    throw new AppError('FORBIDDEN', 'Você não pode gerenciar a equipe deste evento.', 403);
  }
}

export async function listAssignedEvents(userId: string) {
  const assignments = await prisma.eventStaff.findMany({
    where: { userId, user: { role: Role.STAFF } },
    select: { event: { select: { id: true, title: true, location: true, startsAt: true } } },
    orderBy: [{ event: { startsAt: 'asc' } }, { eventId: 'asc' }],
  });
  return assignments.map(({ event }) => event);
}

export async function listEventStaff(eventId: string, requesterId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true },
  });
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
  assertEventOwner(event.organizerId, requesterId);

  const members = await prisma.eventStaff.findMany({
    where: { eventId },
    select: memberSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return members.map(toStaffMember);
}

export async function addEventStaff(eventId: string, requesterId: string, email: string) {
  return prisma.$transaction(async tx => {
    const event = await lockEventForWrite(tx, eventId);
    assertEventOwner(event.organizerId, requesterId);

    const staff = await tx.user.findUnique({
      where: { email, role: Role.STAFF },
      select: { id: true },
    });
    if (!staff) {
      throw new AppError('STAFF_NOT_FOUND', 'Nenhuma conta STAFF foi encontrada com este e-mail.', 404);
    }

    try {
      const assignment = await tx.eventStaff.create({
        data: { eventId, userId: staff.id },
        select: memberSelect,
      });
      return toStaffMember(assignment);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('STAFF_ALREADY_ASSIGNED', 'Esta pessoa já integra a equipe do evento.', 409);
      }
      throw error;
    }
  }, { isolationLevel: 'ReadCommitted' });
}

export async function removeEventStaff(eventId: string, requesterId: string, userId: string) {
  await prisma.$transaction(async tx => {
    const event = await lockEventForWrite(tx, eventId);
    assertEventOwner(event.organizerId, requesterId);
    await tx.eventStaff.deleteMany({ where: { eventId, userId } });
  }, { isolationLevel: 'ReadCommitted' });
}
