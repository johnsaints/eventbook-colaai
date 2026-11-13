import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { expireDueOrders } from '../src/modules/orders/orders.expiration.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

const cutoff = new Date('2001-01-01T12:00:00Z');

beforeAll(async () => {
  const unrelated = await prisma.order.count({
    where: { status: 'PENDING', expiresAt: { lte: cutoff } },
  });
  if (unrelated !== 0) throw new Error('Já existem reservas no intervalo usado pelas fixtures.');
});

afterAll(() => prisma.$disconnect());

type Fixture = {
  userId: string;
  eventId: string;
  lotIds: string[];
};

async function withLots(run: (fixture: Fixture) => Promise<void>) {
  const user = await prisma.user.create({
    data: { name: 'Fixture', email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login' },
  });
  try {
    const event = await prisma.event.create({
      data: {
        organizerId: user.id, title: 'Evento de expiração', description: 'Fixture',
        location: 'Fortaleza, CE', capacity: 400, startsAt: cutoff,
        endsAt: new Date(cutoff.getTime() + 3_600_000),
      },
    });
    const lots = await Promise.all(['Lote A', 'Lote B'].map(name => prisma.ticketLot.create({
      data: {
        name, eventId: event.id, price: '25.00', totalQuantity: 200,
        salesStartsAt: new Date(cutoff.getTime() - 3_600_000), salesEndsAt: cutoff,
      },
    })));
    await run({ userId: user.id, eventId: event.id, lotIds: lots.map(lot => lot.id) });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: user.id } }),
      prisma.event.deleteMany({ where: { organizerId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
  }
}

async function addOrder(
  fixture: Fixture,
  lotIds: string[],
  expiresAt: Date,
  status: 'PENDING' | 'PAID' = 'PENDING'
) {
  return prisma.$transaction(async tx => {
    for (const id of lotIds) {
      await tx.ticketLot.update({
        where: { id },
        data: status === 'PENDING' ? { reservedQty: { increment: 1 } } : { soldQuantity: { increment: 1 } },
      });
    }
    return tx.order.create({
      data: {
        buyerId: fixture.userId, eventId: fixture.eventId, totalAmount: 25 * lotIds.length,
        status, expiresAt, createdAt: new Date(expiresAt.getTime() - 15 * 60_000),
        items: { create: lotIds.map(lotId => ({ lotId, quantity: 1, unitPriceSnapshot: '25.00' })) },
      },
    });
  });
}

it('expira somente a reserva vencida e devolve todos os seus lotes uma vez', async () => {
  await withLots(async fixture => {
    const [first, second] = fixture.lotIds;
    const due = await addOrder(fixture, [first, second], cutoff);
    const future = await addOrder(fixture, [first], new Date(cutoff.getTime() + 1));
    const paid = await addOrder(fixture, [first], cutoff, 'PAID');

    const counts = await Promise.all([expireDueOrders(cutoff), expireDueOrders(cutoff)]);
    expect(counts.sort()).toEqual([0, 1]);
    const orders = await prisma.order.findMany({ where: { eventId: fixture.eventId } });
    expect(orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: due.id, status: 'EXPIRED' }),
      expect.objectContaining({ id: future.id, status: 'PENDING' }),
      expect.objectContaining({ id: paid.id, status: 'PAID' }),
    ]));
    const lots = await prisma.ticketLot.findMany({ where: { eventId: fixture.eventId } });
    expect(lots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first, reservedQty: 1, soldQuantity: 1 }),
      expect.objectContaining({ id: second, reservedQty: 0, soldQuantity: 0 }),
    ]));
  });
});

it('processa mais de 100 pedidos com o mesmo vencimento', async () => {
  await withLots(async ({ userId, eventId, lotIds: [lotId] }) => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    await prisma.$transaction([
      prisma.order.createMany({
        data: ids.map(id => ({
          id, eventId, buyerId: userId, totalAmount: '25.00', expiresAt: cutoff,
          createdAt: new Date(cutoff.getTime() - 15 * 60_000),
        })),
      }),
      prisma.orderItem.createMany({
        data: ids.map(orderId => ({ orderId, lotId, quantity: 1, unitPriceSnapshot: '25.00' })),
      }),
      prisma.ticketLot.update({ where: { id: lotId }, data: { reservedQty: 101 } }),
    ]);

    expect(await expireDueOrders(cutoff)).toBe(101);
    expect(await prisma.order.count({ where: { eventId, status: 'EXPIRED' } })).toBe(101);
    expect((await prisma.ticketLot.findUniqueOrThrow({ where: { id: lotId } })).reservedQty).toBe(0);
  });
}, 15_000);

it('reverte uma liberação inconsistente e processa o próximo evento', async () => {
  await withLots(async damaged => {
    await withLots(async healthy => {
      const broken = await addOrder(damaged, damaged.lotIds, cutoff);
      await prisma.ticketLot.update({ where: { id: damaged.lotIds[1] }, data: { reservedQty: 0 } });
      const due = await addOrder(healthy, healthy.lotIds, cutoff);

      await expect(expireDueOrders(cutoff)).rejects.toThrow(AggregateError);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: broken.id } })).status).toBe('PENDING');
      expect((await prisma.ticketLot.findUniqueOrThrow({ where: { id: damaged.lotIds[0] } })).reservedQty).toBe(1);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('EXPIRED');
    });
  });
});
