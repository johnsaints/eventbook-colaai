import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { cancelOrder } from '../src/modules/orders/orders.service.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

afterAll(() => prisma.$disconnect());

type Fixture = {
  orderId: string;
  eventId: string;
  buyerId: string;
  auth: string;
  lotIds: string[];
  startsAt: Date;
};

const hour = 3_600_000;

async function withPaidOrder(run: (fixture: Fixture) => Promise<void>) {
  const [organizer, buyer] = await prisma.$transaction(
    (['ORGANIZER', 'BUYER'] as const).map(role => prisma.user.create({
      data: { name: role, email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login', role },
    }))
  );
  try {
    const now = Date.now();
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id, title: 'Evento para cancelamento', description: 'Fixture',
        location: 'Fortaleza, CE', capacity: 20, status: 'PUBLISHED',
        startsAt: new Date(now + 24 * hour), endsAt: new Date(now + 26 * hour),
      },
    });
    const lots = await Promise.all(['Lote A', 'Lote B'].map(name => prisma.ticketLot.create({
      data: {
        eventId: event.id, name, price: '25.00', totalQuantity: 10,
        salesStartsAt: new Date(now - hour), salesEndsAt: event.startsAt,
      },
    })));
    const auth = 'Bearer ' + jwt.sign({ role: 'BUYER' }, env.JWT_SECRET, { subject: buyer.id });
    const lotIds = lots.map(lot => lot.id);
    const { body } = await request(app).post('/orders').set('Authorization', auth).send({
      eventId: event.id,
      items: [{ lotId: lotIds[0], quantity: 2 }, { lotId: lotIds[1], quantity: 1 }],
    }).expect(201);
    await request(app).post('/orders/' + body.id + '/checkout').set('Authorization', auth).expect(200);

    await run({ orderId: body.id, eventId: event.id, buyerId: buyer.id, auth, lotIds, startsAt: event.startsAt });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: buyer.id } }),
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [organizer.id, buyer.id] } } }),
    ]);
  }
}

const cancel = (orderId: string, auth: string) =>
  request(app).post('/orders/' + orderId + '/cancel').set('Authorization', auth);

it('cancela a compra exatamente 12h antes e libera apenas seus ingressos uma vez', async () => {
  await withPaidOrder(async ({ orderId, eventId, auth, lotIds, startsAt }) => {
    const { body: other } = await request(app).post('/orders').set('Authorization', auth).send({
      eventId, items: [{ lotId: lotIds[0], quantity: 1 }],
    }).expect(201);
    await request(app).post('/orders/' + other.id + '/checkout').set('Authorization', auth).expect(200);
    const deadline = new Date(startsAt.getTime() - 12 * hour);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(deadline);
      const [first, repeated] = await Promise.all([cancel(orderId, auth).expect(200), cancel(orderId, auth).expect(200)]);
      expect(first.body).toMatchObject({ id: orderId, status: 'CANCELLED', cancelledAt: deadline.toISOString() });
      expect(repeated.body).toEqual(first.body);
    } finally {
      vi.useRealTimers();
    }

    const tickets = await prisma.ticket.findMany({ where: { orderId } });
    expect(tickets).toHaveLength(3);
    expect(tickets.every(ticket => ticket.status === 'CANCELLED')).toBe(true);
    expect(await prisma.ticket.count({ where: { orderId: other.id, status: 'VALID' } })).toBe(1);
    const lots = await prisma.ticketLot.findMany({ where: { eventId } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], soldQuantity: 1, reservedQty: 0 }),
      expect.objectContaining({ id: lotIds[1], soldQuantity: 0, reservedQty: 0 }),
    ]));
  });
});

it.each([
  ['11h59 antes do evento', 60_000],
  ['um milissegundo após o limite', 1],
])('bloqueia o cancelamento %s', async (_label, elapsed) => {
  await withPaidOrder(async ({ orderId, eventId, auth, lotIds, startsAt }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(startsAt.getTime() - 12 * hour + elapsed);
      const { body } = await cancel(orderId, auth).expect(422);
      expect(body.code).toBe('CANCELLATION_WINDOW_CLOSED');
    } finally {
      vi.useRealTimers();
    }

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(stored).toMatchObject({ status: 'PAID', cancelledAt: null });
    expect(await prisma.ticket.count({ where: { orderId, status: 'VALID' } })).toBe(3);
    const lots = await prisma.ticketLot.findMany({ where: { eventId } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], soldQuantity: 2, reservedQty: 0 }),
      expect.objectContaining({ id: lotIds[1], soldQuantity: 1, reservedQty: 0 }),
    ]));
  });
});

it('reverte a invalidação e a devolução se faltar estoque vendido em um dos lotes', async () => {
  await withPaidOrder(async ({ orderId, buyerId, lotIds }) => {
    const [firstId, lastId] = [...lotIds].sort();
    const before = await prisma.ticketLot.findUniqueOrThrow({ where: { id: firstId } });
    await prisma.ticketLot.update({ where: { id: lastId }, data: { soldQuantity: 0 } });

    await expect(cancelOrder(buyerId, orderId)).rejects.toThrow('Estoque vendido incompatível');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PAID');
    expect(await prisma.ticket.count({ where: { orderId, status: 'VALID' } })).toBe(3);
    const after = await prisma.ticketLot.findUniqueOrThrow({ where: { id: firstId } });
    expect(after.soldQuantity).toBe(before.soldQuantity);
  });
});
