import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

afterAll(() => prisma.$disconnect());

function auth(id: string, role: Role = 'BUYER') {
  return 'Bearer ' + jwt.sign({ role }, env.JWT_SECRET, { subject: id });
}

type Fixture = {
  buyerAuth: string;
  otherAuth: string;
  emptyAuth: string;
  eventId: string;
  lotId: string;
  paid: string;
  cancelled: string;
  expired: string;
  other: string;
};

async function withHistory(run: (fixture: Fixture) => Promise<void>) {
  const [organizer, buyer, other, empty] = await prisma.$transaction(
    (['ORGANIZER', 'BUYER', 'BUYER', 'BUYER'] as const).map(role => prisma.user.create({
      data: { name: role, email: randomUUID() + '@eventbook.test', password: 'fixture-sem-login', role },
    }))
  );

  try {
    const now = Date.now();
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id, title: 'Evento do histórico', description: 'Fixture',
        location: 'Fortaleza, CE', capacity: 10, status: 'PUBLISHED',
        startsAt: new Date(now + 24 * 3_600_000), endsAt: new Date(now + 25 * 3_600_000),
      },
    });
    const lot = await prisma.ticketLot.create({
      data: {
        eventId: event.id, name: 'Lote do histórico', price: '25.00', totalQuantity: 10,
        salesStartsAt: new Date(now - 60_000), salesEndsAt: event.startsAt,
      },
    });
    const reserve = async (authorization: string, quantity: number) => {
      const { body } = await request(app).post('/orders').set('Authorization', authorization).send({
        eventId: event.id,
        items: [{ lotId: lot.id, quantity }],
      }).expect(201);
      return String(body.id);
    };
    const buy = async (authorization: string, quantity: number) => {
      const id = await reserve(authorization, quantity);
      await request(app).post('/orders/' + id + '/checkout').set('Authorization', authorization).expect(200);
      return id;
    };

    const buyerAuth = auth(buyer.id);
    const otherAuth = auth(other.id);
    const paid = await buy(buyerAuth, 2);
    const cancelled = await buy(buyerAuth, 1);
    await request(app).post('/orders/' + cancelled + '/cancel').set('Authorization', buyerAuth).expect(200);
    const expired = await reserve(buyerAuth, 1);
    const otherOrder = await buy(otherAuth, 1);
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: [paid, cancelled, expired, otherOrder] } },
        data: { createdAt: new Date(now - 20 * 60_000) },
      }),
      prisma.order.update({ where: { id: expired }, data: { expiresAt: new Date(now - 1) } }),
      prisma.ticket.updateMany({ where: { eventId: event.id }, data: { createdAt: new Date(now) } }),
    ]);
    await run({
      buyerAuth, otherAuth, emptyAuth: auth(empty.id), eventId: event.id, lotId: lot.id,
      paid, cancelled, expired, other: otherOrder,
    });
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: { in: [buyer.id, other.id, empty.id] } } }),
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [organizer.id, buyer.id, other.id, empty.id] } } }),
    ]);
  }
}

const list = (path: string, authorization: string) =>
  request(app).get(path).set('Authorization', authorization);

it('lista e pagina somente os pedidos do comprador, com desempate estável', async () => {
  await withHistory(async fixture => {
    const event = { id: fixture.eventId, title: 'Evento do histórico', location: 'Fortaleza, CE' };
    const orderedIds = [fixture.paid, fixture.cancelled, fixture.expired].sort().reverse();
    const one = await list('/orders/me?page=1&limit=2', fixture.buyerAuth).expect(200);
    const two = await list('/orders/me?page=2&limit=2', fixture.buyerAuth).expect(200);
    expect(one.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(two.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    const rows = [...one.body.data, ...two.body.data];
    expect(rows.map(row => row.id)).toEqual(orderedIds);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.paid, status: 'PAID', totalAmount: '50.00', event: expect.objectContaining(event) }),
      expect.objectContaining({ id: fixture.cancelled, status: 'CANCELLED', cancelledAt: expect.any(String) }),
      expect.objectContaining({ id: fixture.expired, status: 'EXPIRED' }),
    ]));
    expect(rows.find(row => row.id === fixture.paid)).not.toHaveProperty('buyerId');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.expired } })).status).toBe('PENDING');

    const other = await list('/orders/me', fixture.otherAuth).expect(200);
    expect(other.body.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(other.body.data.map((row: { id: string }) => row.id)).toEqual([fixture.other]);
  });
});

it('pagina ingressos próprios e inclui os cancelados com seu status', async () => {
  await withHistory(async fixture => {
    const first = await list('/tickets/me?limit=2', fixture.buyerAuth).expect(200);
    const second = await list('/tickets/me?page=2&limit=2', fixture.buyerAuth).expect(200);
    expect(first.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(second.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    const rows = [...first.body.data, ...second.body.data];
    expect(new Set(rows.map(row => row.code)).size).toBe(3);
    expect(rows.filter(row => row.orderId === fixture.paid && row.status === 'VALID')).toHaveLength(2);
    expect(rows.find(row => row.orderId === fixture.cancelled)).toMatchObject({
      status: 'CANCELLED',
      code: expect.any(String),
      event: { id: fixture.eventId, title: 'Evento do histórico' },
      lot: { id: fixture.lotId, name: 'Lote do histórico' },
    });
    const other = await list('/tickets/me', fixture.otherAuth).expect(200);
    expect(other.body.meta.total).toBe(1);
    expect(other.body.data[0].orderId).toBe(fixture.other);
    expect(rows.some(row => row.code === other.body.data[0].code)).toBe(false);
  });
});

it('retorna lista vazia com metadados para comprador sem histórico e para página além do total', async () => {
  await withHistory(async fixture => {
    for (const path of ['/orders/me', '/tickets/me']) {
      const empty = await list(path, fixture.emptyAuth).expect(200);
      expect(empty.body).toEqual({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
      const beyond = await list(path + '?page=3&limit=2', fixture.buyerAuth).expect(200);
      expect(beyond.body).toEqual({ data: [], meta: { page: 3, limit: 2, total: 3, totalPages: 2 } });
    }
  });
});

it('protege as duas listagens e rejeita parâmetros de paginação inválidos', async () => {
  const buyerAuth = auth(randomUUID());
  for (const path of ['/orders/me', '/tickets/me']) {
    await request(app).get(path).expect(401);
    await list(path, auth(randomUUID(), 'ORGANIZER')).expect(403);
    for (const query of ['page=0', 'limit=51', 'page=1&page=2', 'page=9999999999999']) {
      const response = await list(path + '?' + query, buyerAuth).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  }
});
