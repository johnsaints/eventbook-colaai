import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { checkoutOrder } from '../src/modules/orders/orders.checkout.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

afterAll(() => prisma.$disconnect());

type Fixture = {
  orderId: string;
  eventId: string;
  buyerId: string;
  buyerAuth: string;
  lotIds: string[];
};

async function withOrder(run: (fixture: Fixture) => Promise<void>) {
  const [organizer, buyer] = await prisma.$transaction(
    (['ORGANIZER', 'BUYER'] as const).map(role => prisma.user.create({
      data: { name: role, email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login', role },
    }))
  );
  try {
    const now = Date.now();
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id, title: 'Evento de checkout', description: 'Fixture',
        location: 'Fortaleza, CE', capacity: 10, status: 'PUBLISHED',
        startsAt: new Date(now + 3_600_000), endsAt: new Date(now + 7_200_000),
      },
    });
    const lots = await Promise.all(['24.99', '10.52'].map(price => prisma.ticketLot.create({
      data: {
        eventId: event.id, name: 'Lote de checkout', price, totalQuantity: 5,
        salesStartsAt: new Date(now - 60_000), salesEndsAt: event.startsAt,
      },
    })));
    const buyerAuth = 'Bearer ' + jwt.sign({ role: 'BUYER' }, env.JWT_SECRET, { subject: buyer.id });
    const lotIds = lots.map(lot => lot.id);
    const { body } = await request(app).post('/orders').set('Authorization', buyerAuth).send({
      eventId: event.id,
      items: [{ lotId: lotIds[0], quantity: 2 }, { lotId: lotIds[1], quantity: 1 }],
    }).expect(201);
    await run({ orderId: body.id, buyerId: buyer.id, eventId: event.id, buyerAuth, lotIds });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: buyer.id } }),
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [organizer.id, buyer.id] } } }),
    ]);
  }
}

const checkout = (orderId: string, auth: string) =>
  request(app).post('/orders/' + orderId + '/checkout').set('Authorization', auth);

it('converte a reserva em venda e emite três ingressos uma única vez sob concorrência', async () => {
  await withOrder(async ({ orderId, buyerAuth, eventId, lotIds }) => {
    await prisma.ticketLot.update({ where: { id: lotIds[0] }, data: { price: '99.00' } });
    const responses = await Promise.all([checkout(orderId, buyerAuth), checkout(orderId, buyerAuth)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const paid = responses.find(response => response.status === 200)!.body;
    expect(paid).toMatchObject({ id: orderId, eventId, status: 'PAID', totalAmount: '60.50', ticketCount: 3 });
    expect(Number.isFinite(Date.parse(paid.paidAt))).toBe(true);
    expect(responses.find(response => response.status === 409)!.body.code).toBe('ORDER_ALREADY_PAID');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PAID');
    expect(order.paidAt?.toISOString()).toBe(paid.paidAt);
    const tickets = await prisma.ticket.findMany({ where: { orderId } });
    expect(tickets).toHaveLength(3);
    expect(new Set(tickets.map(ticket => ticket.code)).size).toBe(3);
    expect(tickets.every(ticket => ticket.eventId === eventId && ticket.status === 'VALID')).toBe(true);
    expect(tickets.filter(ticket => ticket.lotId === lotIds[0])).toHaveLength(2);
    expect(tickets.filter(ticket => ticket.lotId === lotIds[1])).toHaveLength(1);

    const lots = await prisma.ticketLot.findMany({ where: { eventId } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], reservedQty: 0, soldQuantity: 2 }),
      expect.objectContaining({ id: lotIds[1], reservedQty: 0, soldQuantity: 1 }),
    ]));
  });
});

it('exige autenticação e oculta o pedido de outro comprador', async () => {
  await withOrder(async ({ orderId }) => {
    await request(app).post('/orders/' + orderId + '/checkout').expect(401);
    const other = 'Bearer ' + jwt.sign({ role: 'BUYER' }, env.JWT_SECRET, { subject: randomUUID() });
    const { body } = await checkout(orderId, other).expect(404);
    expect(body.code).toBe('ORDER_NOT_FOUND');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });
});

it('expira a reserva no instante do vencimento e bloqueia o checkout', async () => {
  await withOrder(async ({ orderId, buyerAuth, eventId }) => {
    const original = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(original.expiresAt);
      const { body } = await checkout(orderId, buyerAuth).expect(422);
      expect(body.code).toBe('ORDER_EXPIRED');
      const expired = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(expired).toMatchObject({ status: 'EXPIRED', paidAt: null });
      expect(await prisma.ticket.count({ where: { orderId } })).toBe(0);
      const lots = await prisma.ticketLot.findMany({ where: { eventId } });
      expect(lots.every(lot => lot.reservedQty === 0 && lot.soldQuantity === 0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

it('bloqueia o checkout de um pedido cancelado', async () => {
  await withOrder(async ({ orderId, buyerAuth }) => {
    await request(app).post('/orders/' + orderId + '/cancel').set('Authorization', buyerAuth).expect(200);
    const { body } = await checkout(orderId, buyerAuth).expect(409);
    expect(body.code).toBe('ORDER_NOT_PENDING');
    expect(await prisma.ticket.count({ where: { orderId } })).toBe(0);
  });
});

it('mantém o pedido pendente e o estoque reservado quando o gateway recusa', async () => {
  await withOrder(async ({ orderId, buyerId, eventId, lotIds }) => {
    await expect(checkoutOrder(buyerId, orderId, { approve: () => false }))
      .rejects.toMatchObject({ code: 'PAYMENT_DECLINED', statusCode: 422 });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ status: 'PENDING', paidAt: null });
    expect(await prisma.ticket.count({ where: { orderId } })).toBe(0);
    const lots = await prisma.ticketLot.findMany({ where: { eventId } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lotIds[0], reservedQty: 2, soldQuantity: 0 }),
      expect.objectContaining({ id: lotIds[1], reservedQty: 1, soldQuantity: 0 }),
    ]));
  });
});

it('reverte ingressos e contadores do primeiro lote se a conversão do segundo falhar', async () => {
  await withOrder(async ({ orderId, buyerId, lotIds }) => {
    const [firstId, lastId] = [...lotIds].sort();
    const firstBefore = await prisma.ticketLot.findUniqueOrThrow({ where: { id: firstId } });
    await prisma.ticketLot.update({ where: { id: lastId }, data: { reservedQty: 0 } });

    await expect(checkoutOrder(buyerId, orderId)).rejects.toThrow('Reserva incompatível');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    expect(await prisma.ticket.count({ where: { orderId } })).toBe(0);
    const firstAfter = await prisma.ticketLot.findUniqueOrThrow({ where: { id: firstId } });
    expect(firstAfter).toMatchObject({ reservedQty: firstBefore.reservedQty, soldQuantity: 0 });
  });
});
