import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

afterAll(() => prisma.$disconnect());

type Fixture = {
  orderId: string;
  ownerAuth: string;
  otherAuth: string;
  lotIds: string[];
};

async function withOrder(run: (fixture: Fixture) => Promise<void>) {
  const [owner, other] = await prisma.$transaction(
    [1, 2].map(() => prisma.user.create({
      data: { name: 'Comprador', email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login' },
    }))
  );
  try {
    const now = Date.now();
    const event = await prisma.event.create({
      data: {
        organizerId: owner.id, title: 'Evento de teste', description: 'Fixture', location: 'Fortaleza, CE',
        capacity: 20, status: 'PUBLISHED', startsAt: new Date(now + 3_600_000),
        endsAt: new Date(now + 7_200_000),
      },
    });
    const lots = await Promise.all(['24.99', '10.52'].map(price => prisma.ticketLot.create({
      data: {
        eventId: event.id, name: 'Lote de teste', price, totalQuantity: 5,
        salesStartsAt: new Date(now - 60_000), salesEndsAt: event.startsAt,
      },
    })));
    const auth = (id: string) => 'Bearer ' + jwt.sign({ role: 'BUYER' }, env.JWT_SECRET, { subject: id });
    const ownerAuth = auth(owner.id);
    const lotIds = lots.map(lot => lot.id);
    const { body } = await request(app).post('/orders').set('Authorization', ownerAuth).send({
      eventId: event.id,
      items: [{ lotId: lotIds[0], quantity: 2 }, { lotId: lotIds[1], quantity: 1 }],
    }).expect(201);
    await run({ orderId: body.id, ownerAuth, otherAuth: auth(other.id), lotIds });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: owner.id } }),
      prisma.event.deleteMany({ where: { organizerId: owner.id } }),
      prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }),
    ]);
  }
}

const detail = (id: string, auth: string) =>
  request(app).get('/orders/' + id).set('Authorization', auth);
const cancel = (id: string, auth: string) =>
  request(app).post('/orders/' + id + '/cancel').set('Authorization', auth);

it('mostra o pedido ao dono com o preço da reserva', async () => {
  await withOrder(async ({ orderId, ownerAuth, lotIds }) => {
    await prisma.ticketLot.update({ where: { id: lotIds[0] }, data: { price: '99.00' } });
    const { body } = await detail(orderId, ownerAuth).expect(200);
    expect(body).toMatchObject({ id: orderId, status: 'PENDING', cancelledAt: null, totalAmount: '60.50' });
    expect(body.items).toEqual(expect.arrayContaining([
      { lotId: lotIds[0], quantity: 2, unitPriceSnapshot: '24.99' },
      { lotId: lotIds[1], quantity: 1, unitPriceSnapshot: '10.52' },
    ]));
  });
});

it('oculta pedidos de outro comprador nas duas rotas', async () => {
  await withOrder(async ({ orderId, ownerAuth, otherAuth }) => {
    await request(app).get('/orders/' + orderId).expect(401);
    await request(app).post('/orders/' + orderId + '/cancel').expect(401);
    const denied = await detail(orderId, otherAuth).expect(404);
    const missing = await detail(randomUUID(), otherAuth).expect(404);
    expect(denied.body).toEqual(missing.body);
    expect(denied.body.code).toBe('ORDER_NOT_FOUND');
    const blocked = await cancel(orderId, otherAuth).expect(404);
    expect(blocked.body).toEqual(missing.body);
    const invalid = await detail('id-invalido', ownerAuth).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });
});

it('cancelamentos concorrentes preservam a primeira data e liberam só a quantidade do pedido', async () => {
  await withOrder(async ({ orderId, ownerAuth, lotIds }) => {
    const original = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await request(app).post('/orders').set('Authorization', ownerAuth).send({
      eventId: original.eventId, items: [{ lotId: lotIds[0], quantity: 1 }],
    }).expect(201);

    const [first, repeated] = await Promise.all([
      cancel(orderId, ownerAuth).expect(200),
      cancel(orderId, ownerAuth).expect(200),
    ]);
    expect(first.body).toMatchObject({ id: orderId, status: 'CANCELLED' });
    expect(Date.parse(first.body.cancelledAt)).toBeGreaterThanOrEqual(original.createdAt.getTime());
    expect(repeated.body.cancelledAt).toBe(first.body.cancelledAt);
    const lookedUp = await detail(orderId, ownerAuth).expect(200);
    expect(lookedUp.body).toEqual(first.body);
    const lots = await prisma.ticketLot.findMany({ where: { id: { in: lotIds } } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], reservedQty: 1 }),
      expect.objectContaining({ id: lotIds[1], reservedQty: 0 }),
    ]));
  });
});

it('trata o instante do vencimento como expiração e não como cancelamento', async () => {
  await withOrder(async ({ orderId, ownerAuth, lotIds }) => {
    const original = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(original.expiresAt);
      const { body } = await detail(orderId, ownerAuth).expect(200);
      expect(body.status).toBe('EXPIRED');
      const expired = await cancel(orderId, ownerAuth).expect(422);
      expect(expired.body.code).toBe('ORDER_EXPIRED');
      const stored = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(stored).toMatchObject({ status: 'EXPIRED', cancelledAt: null });
      const lots = await prisma.ticketLot.findMany({ where: { id: { in: lotIds } } });
      expect(lots.map(lot => lot.reservedQty)).toEqual([0, 0]);
    } finally {
      vi.useRealTimers();
    }
  });
});

it('rejeita cancelamento fora do prazo e preserva os ingressos vendidos', async () => {
  await withOrder(async ({ orderId, ownerAuth, lotIds }) => {
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date() } }),
      prisma.ticketLot.update({ where: { id: lotIds[0] }, data: { soldQuantity: 2, reservedQty: 0 } }),
      prisma.ticketLot.update({ where: { id: lotIds[1] }, data: { soldQuantity: 1, reservedQty: 0 } }),
    ]);
    const { body } = await cancel(orderId, ownerAuth).expect(422);
    expect(body.code).toBe('CANCELLATION_WINDOW_CLOSED');
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(stored).toMatchObject({ status: 'PAID', cancelledAt: null });
    const lots = await prisma.ticketLot.findMany({ where: { id: { in: lotIds } } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], soldQuantity: 2, reservedQty: 0 }),
      expect.objectContaining({ id: lotIds[1], soldQuantity: 1, reservedQty: 0 }),
    ]));
  });
});
