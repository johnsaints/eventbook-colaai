import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { checkIn, withCheckinFixture } from './checkin.fixture.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

afterAll(() => prisma.$disconnect());

const occupancy = (eventId: string) => request(app).get('/events/' + eventId + '/occupancy');

it('agrega estoque, vendas e check-ins de um evento e de seus lotes', async () => {
  await withCheckinFixture(async ({ eventId, ownerAuth, staffAuth, staffId, startsAt, ticket, foreign }) => {
    // A fixture inclui um ingresso cancelado. O estoque vendido já foi devolvido.
    const soldLot = await prisma.ticketLot.update({
      where: { id: ticket.lotId },
      data: { soldQuantity: 2 },
    });
    const secondLot = await prisma.ticketLot.create({
      data: {
        eventId, name: 'Lote inativo', price: '20.00', totalQuantity: 7, reservedQty: 3,
        salesStartsAt: soldLot.salesStartsAt, salesEndsAt: startsAt, active: false,
      },
    });
    await prisma.eventStaff.create({ data: { eventId: foreign.eventId, userId: staffId } });
    await checkIn(foreign.code, foreign.eventId, staffAuth).expect(201);
    await checkIn(ticket.code, eventId, staffAuth).expect(201);

    const { body } = await occupancy(eventId).set('Authorization', ownerAuth)
      .expect(200).expect('Cache-Control', 'no-store');
    expect(body).toEqual({
      eventId,
      totals: { totalTickets: 12, soldTickets: 2, checkIns: 1, occupancyPercentage: 8.33 },
      lots: expect.arrayContaining([
        {
          id: soldLot.id, name: soldLot.name, totalTickets: 5, soldTickets: 2,
          checkIns: 1, occupancyPercentage: 20,
        },
        {
          id: secondLot.id, name: secondLot.name, totalTickets: 7, soldTickets: 0,
          checkIns: 0, occupancyPercentage: 0,
        },
      ]),
    });
    expect(body.lots).toHaveLength(2);
  });
});

it('retorna totais zerados para um evento sem lotes', async () => {
  await withCheckinFixture(async ({ eventId, ownerAuth, startsAt, endsAt }) => {
    const { organizerId } = await prisma.event.findUniqueOrThrow({
      where: { id: eventId }, select: { organizerId: true },
    });
    const empty = await prisma.event.create({
      data: {
        organizerId, title: 'Evento sem lotes', description: 'Fixture RN-10',
        location: 'Fortaleza, CE', capacity: 20, startsAt, endsAt,
      },
    });

    const { body } = await occupancy(empty.id).set('Authorization', ownerAuth).expect(200);
    expect(body).toEqual({
      eventId: empty.id,
      totals: { totalTickets: 0, soldTickets: 0, checkIns: 0, occupancyPercentage: 0 },
      lots: [],
    });
  });
});

it('restringe a consulta ao organizador dono e valida o identificador', async () => {
  await withCheckinFixture(async ({ eventId, ownerAuth, staffAuth }) => {
    const other = await prisma.user.create({
      data: { name: 'Outro organizador', email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login', role: 'ORGANIZER' },
    });
    try {
      const otherToken = jwt.sign({ role: 'ORGANIZER' }, env.JWT_SECRET, { subject: other.id });
      const adminToken = jwt.sign({ role: 'ADMIN' }, env.JWT_SECRET, { subject: other.id });

      await occupancy(eventId).expect(401);
      for (const auth of [staffAuth, 'Bearer ' + otherToken, 'Bearer ' + adminToken]) {
        const { body } = await occupancy(eventId).set('Authorization', auth).expect(403);
        expect(body.code).toBe('FORBIDDEN');
      }
      await occupancy('invalido').set('Authorization', ownerAuth).expect(400);
      const missing = await occupancy(randomUUID()).set('Authorization', ownerAuth).expect(404);
      expect(missing.body.code).toBe('EVENT_NOT_FOUND');

      const { organizerId } = await prisma.event.findUniqueOrThrow({
        where: { id: eventId }, select: { organizerId: true },
      });
      await prisma.user.update({ where: { id: organizerId }, data: { role: 'STAFF' } });
      await occupancy(eventId).set('Authorization', ownerAuth).expect(403);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
