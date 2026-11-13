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

it('RN-01 bloqueia a edição de um evento que já começou', async () => {
  const organizer = await prisma.user.create({
    data: {
      name: 'Organizador de teste',
      email: `${randomUUID()}@eventbook.test`,
      password: 'fixture-sem-login',
      role: 'ORGANIZER',
    },
  });

  try {
    const event = await prisma.event.create({
      data: {
        title: 'Evento encerrado',
        description: 'Evento criado pelo teste da RN-01.',
        location: 'Fortaleza, CE',
        startsAt: new Date('2020-01-01T18:00:00Z'),
        endsAt: new Date('2020-01-01T20:00:00Z'),
        capacity: 100,
        organizerId: organizer.id,
      },
    });
    const token = jwt.sign({ role: organizer.role }, env.JWT_SECRET, {
      subject: organizer.id,
    });

    const response = await request(app)
      .patch(`/events/${event.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ capacity: 120 });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EVENT_IN_PAST');
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.capacity).toBe(100);
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.delete({ where: { id: organizer.id } }),
    ]);
  }
});