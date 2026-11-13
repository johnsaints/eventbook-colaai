import { randomUUID } from 'node:crypto';
import type { Role, Ticket } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

function authorization(id: string, role: Role) {
  return 'Bearer ' + jwt.sign({ role }, env.JWT_SECRET, { subject: id });
}

type Fixture = {
  eventId: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string;
  secondStaffId: string;
  staffAuth: string;
  secondStaffAuth: string;
  unlinkedAuth: string;
  ownerAuth: string;
  ticket: Ticket;
  cancelled: Ticket;
  used: Ticket;
  foreign: Ticket;
};

const hour = 3_600_000;

export async function withCheckinFixture(
  run: (fixture: Fixture) => Promise<void>,
  startsAt = new Date(Date.now() + hour)
) {
  const users = await prisma.$transaction(
    (['ORGANIZER', 'BUYER', 'STAFF', 'STAFF', 'STAFF'] as const).map(role => prisma.user.create({
      data: { name: role, email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login', role },
    }))
  );
  const [owner, buyer, staff, secondStaff, unlinked] = users;

  try {
    const endsAt = new Date(startsAt.getTime() + 2 * hour);
    const [event, secondEvent] = await prisma.$transaction(
      ['Evento de check-in', 'Outro evento'].map(title => prisma.event.create({
        data: {
          organizerId: owner.id, title, description: 'Fixture de check-in', location: 'Fortaleza, CE',
          capacity: 10, status: 'PUBLISHED', startsAt, endsAt,
        },
      }))
    );
    await prisma.eventStaff.createMany({
      data: [staff.id, secondStaff.id].map(userId => ({ eventId: event.id, userId })),
    });

    async function issue(eventId: string, statuses: Ticket['status'][]) {
      const lot = await prisma.ticketLot.create({
        data: {
          eventId, name: 'Lote de teste', price: '25.00', totalQuantity: 5,
          soldQuantity: statuses.length, salesStartsAt: new Date(startsAt.getTime() - 3 * hour),
          salesEndsAt: startsAt,
        },
      });
      const order = await prisma.order.create({
        data: {
          buyerId: buyer.id, eventId, totalAmount: 25 * statuses.length, status: 'PAID',
          paidAt: new Date(startsAt.getTime() - hour), expiresAt: startsAt,
          items: { create: { lotId: lot.id, quantity: statuses.length, unitPriceSnapshot: '25.00' } },
        },
      });
      return prisma.$transaction(statuses.map(status => prisma.ticket.create({
        data: {
          code: 'EB-' + randomUUID(), orderId: order.id, eventId, lotId: lot.id, status,
          usedAt: status === 'USED' ? new Date(startsAt.getTime() - hour) : null,
        },
      })));
    }

    const [ticket, cancelled, used] = await issue(event.id, ['VALID', 'CANCELLED', 'USED']);
    const [foreign] = await issue(secondEvent.id, ['VALID']);
    await run({
      eventId: event.id, startsAt, endsAt, staffId: staff.id, secondStaffId: secondStaff.id,
      staffAuth: authorization(staff.id, staff.role),
      secondStaffAuth: authorization(secondStaff.id, secondStaff.role),
      unlinkedAuth: authorization(unlinked.id, unlinked.role),
      ownerAuth: authorization(owner.id, owner.role),
      ticket, cancelled, used, foreign,
    });
  } finally {
    await prisma.$transaction([
      prisma.checkIn.deleteMany({ where: { staffId: { in: [staff.id, secondStaff.id, unlinked.id] } } }),
      prisma.order.deleteMany({ where: { buyerId: buyer.id } }),
      prisma.event.deleteMany({ where: { organizerId: owner.id } }),
      prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }),
    ]);
  }
}

export function checkIn(code: string, eventId: string, auth?: string) {
  const req = request(app).post('/tickets/' + encodeURIComponent(code) + '/checkin').send({ eventId });
  return auth ? req.set('Authorization', auth) : req;
}
