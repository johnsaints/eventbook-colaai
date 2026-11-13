import { randomUUID } from 'node:crypto';
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

const hour = 3_600_000;

async function withEvent(
  run: (eventId: string, auth: string, start: number) => Promise<void>
) {
  const organizer = await prisma.user.create({
    data: {
      name: 'Organizador de teste',
      email: `${randomUUID()}@eventbook.test`,
      password: 'fixture-sem-login',
      role: 'ORGANIZER',
    },
  });

  try {
    const start = Date.now() + 48 * hour;
    const event = await prisma.event.create({
      data: {
        title: 'Evento para teste de lotes',
        description: 'Evento criado pelo teste da M04.',
        location: 'Fortaleza, CE',
        capacity: 100,
        startsAt: new Date(start),
        endsAt: new Date(start + 2 * hour),
        organizerId: organizer.id,
      },
    });
    const token = jwt.sign({ role: organizer.role }, env.JWT_SECRET, {
      subject: organizer.id,
    });
    await run(event.id, `Bearer ${token}`, start);
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.delete({ where: { id: organizer.id } }),
    ]);
  }
}

function lotPayload(start: number) {
  return {
    name: 'Primeiro lote',
    price: 25,
    quantity: 60,
    salesStartAt: new Date(start - 24 * hour).toISOString(),
    salesEndAt: new Date(start).toISOString(),
  };
}

type LotPayload = ReturnType<typeof lotPayload>;

function postLot(eventId: string, auth: string, payload: LotPayload) {
  return request(app).post(`/events/${eventId}/lots`).set('Authorization', auth).send(payload);
}

function patchLot(eventId: string, lotId: string, auth: string, payload: Partial<LotPayload>) {
  return request(app).patch(`/events/${eventId}/lots/${lotId}`).set('Authorization', auth).send(payload);
}

it('cadastra um lote ativo no evento do organizador', async () => {
  await withEvent(async (eventId, auth, start) => {
    const response = await postLot(eventId, auth, lotPayload(start)).expect(201);
    expect(response.body).toMatchObject({ eventId, quantity: 60, active: true });

    const stored = await prisma.ticketLot.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored).toMatchObject({ eventId, totalQuantity: 60, active: true });
  });
});

it('bloqueia cadastro quando a soma dos lotes excede a capacidade', async () => {
  await withEvent(async (eventId, auth, start) => {
    const payload = lotPayload(start);
    await postLot(eventId, auth, payload).expect(201);

    const response = await postLot(eventId, auth, {
      ...payload, name: 'Segundo lote', quantity: 41,
    }).expect(422);

    expect(response.body.code).toBe('LOT_CAPACITY_EXCEEDED');
    expect(await prisma.ticketLot.count({ where: { eventId } })).toBe(1);
  });
});

it('bloqueia cadastro com vendas terminando depois do evento', async () => {
  await withEvent(async (eventId, auth, start) => {
    const response = await postLot(eventId, auth, {
      ...lotPayload(start), salesEndAt: new Date(start + 3 * hour).toISOString(),
    }).expect(422);

    expect(response.body.code).toBe('INVALID_SALE_WINDOW');
    expect(await prisma.ticketLot.count({ where: { eventId } })).toBe(0);
  });
});

it('revalida a capacidade ao editar a quantidade de um lote', async () => {
  await withEvent(async (eventId, auth, start) => {
    const payload = lotPayload(start);
    const { body: lot } = await postLot(eventId, auth, payload).expect(201);
    await postLot(eventId, auth, { ...payload, name: 'Segundo lote', quantity: 30 }).expect(201);

    await patchLot(eventId, lot.id, auth, { quantity: 70 }).expect(200);
    const response = await patchLot(eventId, lot.id, auth, { quantity: 71 }).expect(422);

    expect(response.body.code).toBe('LOT_CAPACITY_EXCEEDED');
    const stored = await prisma.ticketLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(stored.totalQuantity).toBe(70);
  });
});

it('revalida a janela de venda quando a edição envia só uma data', async () => {
  await withEvent(async (eventId, auth, start) => {
    const payload = lotPayload(start);
    const { body: lot } = await postLot(eventId, auth, payload).expect(201);
    const response = await patchLot(eventId, lot.id, auth, {
      salesStartAt: new Date(start + hour).toISOString(),
    }).expect(422);

    expect(response.body.code).toBe('INVALID_SALE_WINDOW');
    const stored = await prisma.ticketLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(stored.salesStartsAt.toISOString()).toBe(payload.salesStartAt);
  });
});