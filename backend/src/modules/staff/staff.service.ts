import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { EventStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { lockEventForWrite } from '../events/events.repository.js';

const memberSelect = {
  userId: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EventStaffSelect;

type Member = Prisma.EventStaffGetPayload<{ select: typeof memberSelect }>;

const organizerMemberSelect = {
  userId: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.OrganizerStaffSelect;

type OrganizerMember = Prisma.OrganizerStaffGetPayload<{ select: typeof organizerMemberSelect }>;

function toStaffMember({ user, ...assignment }: Member | OrganizerMember) {
  return { ...assignment, ...user };
}

function generateTemporaryPassword() {
  return `ColaAi-${randomBytes(6).toString('base64url')}`;
}

function assertEventOwner(organizerId: string, requesterId: string) {
  if (organizerId !== requesterId) {
    throw new AppError('FORBIDDEN', 'Você não pode gerenciar a equipe deste evento.', 403);
  }
}

export async function listAssignedEvents(userId: string, role: Role = Role.STAFF) {
  if (role === Role.ADMIN) {
    return prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED },
      select: { id: true, title: true, location: true, startsAt: true },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

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

export async function listOrganizerDefaultStaff(organizerId: string) {
  const members = await prisma.organizerStaff.findMany({
    where: { organizerId, user: { role: Role.STAFF } },
    select: organizerMemberSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return members.map(toStaffMember);
}

export async function addOrganizerDefaultStaff(organizerId: string, email: string) {
  const staff = await prisma.user.findUnique({
    where: { email, role: Role.STAFF },
    select: { id: true },
  });
  if (!staff) {
    throw new AppError('STAFF_NOT_FOUND', 'Nenhuma conta STAFF foi encontrada com este e-mail.', 404);
  }

  try {
    const assignment = await prisma.organizerStaff.create({
      data: { organizerId, userId: staff.id },
      select: organizerMemberSelect,
    });
    return toStaffMember(assignment);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('STAFF_ALREADY_IN_TEAM', 'Esta pessoa já faz parte da sua equipe padrão.', 409);
    }
    throw error;
  }
}

export async function removeOrganizerDefaultStaff(organizerId: string, userId: string) {
  await prisma.organizerStaff.deleteMany({ where: { organizerId, userId } });
}

export async function searchStaffCandidates(
  organizerId: string,
  params: { q?: string; eventId?: string },
) {
  if (params.eventId) {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { organizerId: true },
    });
    if (!event) throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    assertEventOwner(event.organizerId, organizerId);
  }

  const search = params.q?.trim();
  const [users, defaultAssignments, eventAssignments] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: Role.STAFF,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: 40,
    }),
    prisma.organizerStaff.findMany({
      where: { organizerId },
      select: { userId: true },
    }),
    params.eventId
      ? prisma.eventStaff.findMany({
          where: { eventId: params.eventId },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);

  const defaultIds = new Set(defaultAssignments.map((item) => item.userId));
  const eventIds = new Set(eventAssignments.map((item) => item.userId));

  return users
    .map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      inDefaultTeam: defaultIds.has(user.id),
      assignedToEvent: eventIds.has(user.id),
    }))
    .sort((first, second) => {
      if (first.inDefaultTeam !== second.inDefaultTeam) {
        return first.inDefaultTeam ? -1 : 1;
      }
      return first.name.localeCompare(second.name, 'pt-BR') || first.email.localeCompare(second.email);
    })
    .slice(0, 20);
}

export async function provisionStaffMember(
  organizerId: string,
  data: {
    name: string;
    email: string;
    password?: string;
    addToDefaultTeam: boolean;
    eventId?: string;
  },
) {
  const rawPassword = data.password ?? generateTemporaryPassword();
  const generated = !data.password;
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  return prisma.$transaction(async (tx) => {
    if (data.eventId) {
      const event = await lockEventForWrite(tx, data.eventId);
      assertEventOwner(event.organizerId, organizerId);
    }

    const existing = await tx.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        'EMAIL_ALREADY_EXISTS',
        'Este e-mail já está cadastrado no ColaAí. Se já for uma conta STAFF, vincule-a pela busca.',
        409,
      );
    }

    let createdUser: { id: string; name: string; email: string; createdAt: Date };
    try {
      createdUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: Role.STAFF,
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          'EMAIL_ALREADY_EXISTS',
          'Este e-mail já está cadastrado no ColaAí. Se já for uma conta STAFF, vincule-a pela busca.',
          409,
        );
      }
      throw error;
    }

    let defaultAssignment: { createdAt: Date } | null = null;
    if (data.addToDefaultTeam) {
      defaultAssignment = await tx.organizerStaff.create({
        data: { organizerId, userId: createdUser.id },
        select: { createdAt: true },
      });
    }

    let eventAssignment: { createdAt: Date } | null = null;
    if (data.eventId) {
      eventAssignment = await tx.eventStaff.create({
        data: { eventId: data.eventId, userId: createdUser.id },
        select: { createdAt: true },
      });
    }

    return {
      member: {
        userId: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        createdAt: eventAssignment?.createdAt ?? defaultAssignment?.createdAt ?? createdUser.createdAt,
      },
      addedToDefaultTeam: data.addToDefaultTeam,
      assignedToEvent: Boolean(data.eventId),
      ...(generated ? { temporaryPassword: rawPassword } : {}),
    };
  }, { isolationLevel: 'ReadCommitted' });
}

export async function applyDefaultStaffToEvent(eventId: string, organizerId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEventForWrite(tx, eventId);
    assertEventOwner(event.organizerId, organizerId);

    const defaultMembers = await tx.organizerStaff.findMany({
      where: { organizerId, user: { role: Role.STAFF } },
      select: { userId: true },
    });

    let addedCount = 0;
    if (defaultMembers.length > 0) {
      const inserted = await tx.eventStaff.createMany({
        data: defaultMembers.map((member) => ({ eventId, userId: member.userId })),
        skipDuplicates: true,
      });
      addedCount = inserted.count;
    }

    const members = await tx.eventStaff.findMany({
      where: { eventId },
      select: memberSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      addedCount,
      members: members.map(toStaffMember),
    };
  }, { isolationLevel: 'ReadCommitted' });
}
