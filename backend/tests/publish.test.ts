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

it.each([
  {
    scenario: 'bloqueia publicação de evento futuro sem lote',
    startsInHours: 24,
    hasLot: false,
    httpStatus: 422,
    responseBody: { code: 'EVENT_WITHOUT_LOTS' },
    storedStatus: 'DRAFT',
  },
  {
    scenario: 'bloqueia publicação de evento passado com lote',
    startsInHours: -24,
    hasLot: true,
    httpStatus: 422,
    responseBody: { code: 'EVENT_IN_PAST' },
    storedStatus: 'DRAFT',
  },
  {
    scenario: 'publica evento futuro com lote',
    startsInHours: 24,
    hasLot: true,
    httpStatus: 200,
    responseBody: { status: 'PUBLISHED' },
    storedStatus: 'PUBLISHED',
  },
])('$scenario', async ({ startsInHours, hasLot, httpStatus, responseBody, storedStatus }) => {
  const organizer = await prisma.user.create({
    data: {
      name: 'Organizador de teste',
      email: `${randomUUID()}@eventbook.test`,
      password: 'fixture-sem-login',
      role: 'ORGANIZER',
    },
  });

  try {
    const startsAt = new Date(Date.now() + startsInHours * hour);
    const event = await prisma.event.create({
      data: {
        title: 'Evento para teste de publicação',
        description: 'Evento criado para validar a RN-01.',
        location: 'Fortaleza, CE',
        capacity: 100,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * hour),
        organizerId: organizer.id,
        lots: hasLot ? {
          create: {
            name: 'Primeiro lote',
            price: 25,
            totalQuantity: 40,
            salesStartsAt: new Date(startsAt.getTime() - hour),
            salesEndsAt: startsAt,
          },
        } : undefined,
      },
    });
    const token = jwt.sign({ role: organizer.role }, env.JWT_SECRET, {
      subject: organizer.id,
    });

    const response = await request(app)
      .post(`/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(httpStatus);
    expect(response.body).toMatchObject(responseBody);
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.status).toBe(storedStatus);
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.delete({ where: { id: organizer.id } }),
    ]);
  }
});