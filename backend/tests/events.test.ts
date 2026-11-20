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

it('prioriza eventos em destaque e demanda real em GET /events/highlights, ordena em GET /events e restringe PATCH /events/:id/featured ao ADMIN', async () => {
  const [admin, organizer, buyer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: 'Admin Destaques',
        email: `admin-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Organizador Destaques',
        email: `org-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'ORGANIZER',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Comprador Destaques',
        email: `buyer-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'BUYER',
      },
    }),
  ]);

  const adminToken = jwt.sign({ role: admin.role }, env.JWT_SECRET, { subject: admin.id });
  const orgToken = jwt.sign({ role: organizer.role }, env.JWT_SECRET, { subject: organizer.id });
  const buyerToken = jwt.sign({ role: buyer.role }, env.JWT_SECRET, { subject: buyer.id });

  const now = Date.now();
  const marker = randomUUID().slice(0, 8);
  const window = {
    salesStartsAt: new Date(now - 3_600_000),
    salesEndsAt: new Date(now + 14 * 86_400_000),
  };

  try {
    const [smallSoonest, bigPopular, curatedLater] = await prisma.$transaction([
      prisma.event.create({
        data: {
          title: `Evento Pequeno Próximo ${marker}`,
          description: 'Evento pequeno acontecendo logo em seguida.',
          location: 'Fortaleza, CE',
          startsAt: new Date(now + 2 * 86_400_000),
          endsAt: new Date(now + 2 * 86_400_000 + 7_200_000),
          capacity: 60,
          status: 'PUBLISHED',
          featured: false,
          organizerId: organizer.id,
          lots: { create: { ...window, name: 'Lote Único', price: 30, totalQuantity: 60, soldQuantity: 5 } },
        },
      }),
      prisma.event.create({
        data: {
          title: `Festival Grande Popular ${marker}`,
          description: 'Festival grande com alta demanda e grande público.',
          location: 'Fortaleza, CE',
          startsAt: new Date(now + 6 * 86_400_000),
          endsAt: new Date(now + 6 * 86_400_000 + 14_400_000),
          capacity: 1500,
          status: 'PUBLISHED',
          featured: false,
          organizerId: organizer.id,
          lots: { create: { ...window, name: 'Arena', price: 120, totalQuantity: 1500, soldQuantity: 600 } },
        },
      }),
      prisma.event.create({
        data: {
          title: `Show Curado Oficial ${marker}`,
          description: 'Evento marcado como destaque oficial pelo Admin.',
          location: 'Fortaleza, CE',
          startsAt: new Date(now + 10 * 86_400_000),
          endsAt: new Date(now + 10 * 86_400_000 + 10_800_000),
          capacity: 800,
          status: 'PUBLISHED',
          featured: true,
          organizerId: organizer.id,
          lots: { create: { ...window, name: 'Pista', price: 90, totalQuantity: 800, soldQuantity: 150 } },
        },
      }),
    ]);

    const highlightsRes = await request(app).get('/events/highlights?limit=10');
    expect(highlightsRes.status).toBe(200);
    const highlightIds = (highlightsRes.body.data as Array<{ id: string }>).map(e => e.id);
    const idxCurated = highlightIds.indexOf(curatedLater.id);
    const idxBigPopular = highlightIds.indexOf(bigPopular.id);
    const idxSmallSoonest = highlightIds.indexOf(smallSoonest.id);
    expect(idxCurated).toBeGreaterThanOrEqual(0);
    expect(idxBigPopular).toBeGreaterThan(idxCurated);
    expect(idxSmallSoonest).toBeGreaterThan(idxBigPopular);

    const largestRes = await request(app).get(`/events?sort=largest&q=${marker}`);
    expect(largestRes.status).toBe(200);
    expect((largestRes.body.data as Array<{ id: string }>).map(e => e.id)).toEqual([
      bigPopular.id,
      curatedLater.id,
      smallSoonest.id,
    ]);

    const popularRes = await request(app).get(`/events?sort=popular&q=${marker}`);
    expect(popularRes.status).toBe(200);
    expect((popularRes.body.data as Array<{ id: string }>).map(e => e.id)).toEqual([
      bigPopular.id,
      curatedLater.id,
      smallSoonest.id,
    ]);

    const orgToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ featured: true });
    expect(orgToggle.status).toBe(403);

    const buyerToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ featured: true });
    expect(buyerToggle.status).toBe(403);

    const adminToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ featured: true });
    expect(adminToggle.status).toBe(200);
    expect(adminToggle.body.featured).toBe(true);
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [admin.id, organizer.id, buyer.id] } } }),
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