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

it('permite upload válido de capa PNG/JPEG/WebP e bloqueia formato inválido ou SVG', async () => {
  const organizer = await prisma.user.create({
    data: {
      name: 'Organizador capa',
      email: `${randomUUID()}@eventbook.test`,
      password: 'fixture-sem-login',
      role: 'ORGANIZER',
    },
  });

  const validPngBase64 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]).toString('base64');
  const validCover = `data:image/png;base64,${validPngBase64}`;
  const svgAttack = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;

  try {
    const token = jwt.sign({ role: organizer.role }, env.JWT_SECRET, { subject: organizer.id });
    const startsAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 27 * 3_600_000).toISOString();

    const rejected = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Evento com SVG bloqueado',
        description: 'Teste de validação contra SVG ou formato não permitido.',
        location: 'Fortaleza, CE',
        startsAt,
        endsAt,
        capacity: 50,
        coverImage: svgAttack,
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');

    const created = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Evento com capa personalizada',
        description: 'Teste de upload válido na criação de evento.',
        location: 'Fortaleza, CE',
        startsAt,
        endsAt,
        capacity: 50,
        coverImage: validCover,
      });

    expect(created.status).toBe(201);
    expect(created.body.coverImage).toBe(validCover);

    const cleared = await request(app)
      .patch(`/events/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ coverImage: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.coverImage).toBeNull();
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.delete({ where: { id: organizer.id } }),
    ]);
  }
});