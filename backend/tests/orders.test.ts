import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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

const minute = 60_000;

async function withEvent(run: (fixture: {
  eventId: string;
  buyerId: string;
  buyerAuth: string;
  organizerAuth: string;
  now: number;
}) => Promise<void>) {
  const [organizer, buyer] = await prisma.$transaction(
    (['ORGANIZER', 'BUYER'] as const).map(role => prisma.user.create({
      data: {
        name: role,
        email: randomUUID() + '@eventbook.test',
        password: 'fixture-sem-login',
        role,
      },
    }))
  );

  try {
    const now = Date.now();
    const event = await prisma.event.create({
      data: {
        title: 'Evento de teste de pedidos',
        description: 'Fixture de integração',
        location: 'Fortaleza, CE',
        capacity: 100,
        startsAt: new Date(now + 60 * minute),
        endsAt: new Date(now + 120 * minute),
        status: 'PUBLISHED',
        organizerId: organizer.id,
      },
    });
    const auth = (user: typeof buyer) =>
      'Bearer ' + jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user.id });
    await run({
      eventId: event.id,
      buyerId: buyer.id,
      buyerAuth: auth(buyer),
      organizerAuth: auth(organizer),
      now,
    });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: buyer.id } }),
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [organizer.id, buyer.id] } } }),
    ]);
  }
}

function createLot(eventId: string, now: number, overrides: Partial<Prisma.TicketLotUncheckedCreateInput> = {}) {
  return prisma.ticketLot.create({
    data: {
      eventId,
      name: 'Lote de teste',
      price: '24.99',
      totalQuantity: 5,
      salesStartsAt: new Date(now - minute),
      salesEndsAt: new Date(now + 30 * minute),
      ...overrides,
    },
  });
}

function postOrder(auth: string, eventId: string, items: { lotId: string; quantity: number }[]) {
  return request(app).post('/orders').set('Authorization', auth).send({ eventId, items });
}

it('cria a reserva de dois lotes por 15 minutos e mantém o preço original', async () => {
  await withEvent(async ({ eventId, buyerId, buyerAuth, now }) => {
    const first = await createLot(eventId, now);
    const second = await createLot(eventId, now, { price: '10.52' });
    const { body } = await postOrder(buyerAuth, eventId, [
      { lotId: first.id, quantity: 2 },
      { lotId: second.id, quantity: 1 },
    ]).expect(201);
    expect(body).toMatchObject({ eventId, status: 'PENDING', totalAmount: '60.50' });
    expect(body.items).toEqual(expect.arrayContaining([
      { lotId: first.id, quantity: 2, unitPriceSnapshot: '24.99' },
      { lotId: second.id, quantity: 1, unitPriceSnapshot: '10.52' },
    ]));
    expect(Date.parse(body.expiresAt) - Date.parse(body.createdAt)).toBe(15 * minute);

    await prisma.ticketLot.update({ where: { id: first.id }, data: { price: '49.99' } });
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: body.id },
      include: { items: true },
    });
    expect(stored.buyerId).toBe(buyerId);
    expect(stored.totalAmount.toFixed(2)).toBe('60.50');
    expect(stored.items.find(item => item.lotId === first.id)?.unitPriceSnapshot.toFixed(2)).toBe('24.99');
  });
});

it('exige comprador autenticado e rejeita lotes repetidos no mesmo pedido', async () => {
  await withEvent(async ({ eventId, buyerAuth, organizerAuth, now }) => {
    const lot = await createLot(eventId, now);
    const item = { lotId: lot.id, quantity: 1 };
    await request(app).post('/orders').send({ eventId, items: [item] }).expect(401);
    await postOrder(organizerAuth, eventId, [item]).expect(403);
    const { body } = await postOrder(buyerAuth, eventId, [
      item, { ...item, lotId: lot.id.toUpperCase() },
    ]).expect(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

it('rejeita evento não publicado e lote que pertence a outro evento', async () => {
  await withEvent(async ({ eventId, buyerAuth, now }) => {
    const original = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const other = await prisma.event.create({
      data: {
        title: original.title,
        description: original.description,
        location: original.location,
        startsAt: original.startsAt,
        endsAt: original.endsAt,
        capacity: original.capacity,
        organizerId: original.organizerId,
      },
    });
    const lot = await createLot(other.id, now);
    const items = [{ lotId: lot.id, quantity: 1 }];
    const draft = await postOrder(buyerAuth, other.id, items).expect(404);
    expect(draft.body.code).toBe('EVENT_NOT_FOUND');
    const wrongEvent = await postOrder(buyerAuth, eventId, items).expect(404);
    expect(wrongEvent.body.code).toBe('LOT_NOT_FOUND');
  });
});

it('aceita as bordas da janela e rejeita pedidos fora da janela ou em lote inativo', async () => {
  await withEvent(async ({ eventId, buyerAuth, now }) => {
    const endsAt = now + minute;
    const lot = await createLot(eventId, now, {
      salesStartsAt: new Date(now),
      salesEndsAt: new Date(endsAt),
    });
    const items = [{ lotId: lot.id, quantity: 1 }];

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(now - 1);
      const early = await postOrder(buyerAuth, eventId, items).expect(422);
      expect(early.body.code).toBe('LOT_OUT_OF_SALE_WINDOW');
      vi.setSystemTime(now);
      await postOrder(buyerAuth, eventId, items).expect(201);
      vi.setSystemTime(endsAt);
      await postOrder(buyerAuth, eventId, items).expect(201);
      vi.setSystemTime(endsAt + 1);
      const late = await postOrder(buyerAuth, eventId, items).expect(422);
      expect(late.body.code).toBe('LOT_OUT_OF_SALE_WINDOW');
      vi.setSystemTime(endsAt);
      await prisma.ticketLot.update({ where: { id: lot.id }, data: { active: false } });
      const inactive = await postOrder(buyerAuth, eventId, items).expect(422);
      expect(inactive.body.code).toBe('LOT_INACTIVE');
    } finally {
      vi.useRealTimers();
    }
  });
});

it('expira o pedido no limite e libera todos os seus lotes antes de reservar novamente', async () => {
  await withEvent(async ({ eventId, buyerAuth, now }) => {
    const first = await createLot(eventId, now, { totalQuantity: 1 });
    const second = await createLot(eventId, now, { totalQuantity: 1 });

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(now);
      const original = await postOrder(buyerAuth, eventId, [
        { lotId: first.id, quantity: 1 },
        { lotId: second.id, quantity: 1 },
      ]).expect(201);
      const items = [{ lotId: first.id, quantity: 1 }];
      vi.setSystemTime(now + 15 * minute - 1);
      const before = await postOrder(buyerAuth, eventId, items).expect(409);
      expect(before.body.code).toBe('INSUFFICIENT_STOCK');
      vi.setSystemTime(now + 15 * minute);
      const rejected = await postOrder(buyerAuth, eventId, [{ lotId: first.id, quantity: 2 }]).expect(409);
      expect(rejected.body.code).toBe('INSUFFICIENT_STOCK');
      const expired = await prisma.order.findUniqueOrThrow({ where: { id: original.body.id } });
      expect(expired.status).toBe('EXPIRED');
      await postOrder(buyerAuth, eventId, items).expect(201);
      const available = await prisma.ticketLot.findUniqueOrThrow({ where: { id: second.id } });
      expect(available.reservedQty).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

it('aceita só um pedido completo quando oito requisições disputam a última vaga', async () => {
  await withEvent(async ({ eventId, buyerAuth, now }) => {
    const first = await createLot(eventId, now, { totalQuantity: 1 });
    const second = await createLot(eventId, now, { totalQuantity: 8 });
    const items = [
      { lotId: second.id, quantity: 1 },
      { lotId: first.id, quantity: 1 },
    ];
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => postOrder(buyerAuth, eventId, items))
    );

    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect(responses.filter(response => response.status === 409)).toHaveLength(7);
    expect(responses.filter(response => response.status === 409).map(response => response.body.code))
      .toEqual(Array(7).fill('INSUFFICIENT_STOCK'));
    expect(await prisma.orderItem.count({ where: { order: { eventId } } })).toBe(2);
    const lots = await prisma.ticketLot.findMany({ where: { eventId } });
    expect(lots.map(lot => lot.reservedQty)).toEqual([1, 1]);
  });
}, 15_000);
