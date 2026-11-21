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

it('prioriza eventos em destaque e demanda real em GET /events/highlights, ordena em GET /events e permite destaque para ORGANIZER dono ou ADMIN', async () => {
  const [admin, organizer, otherOrganizer, buyer] = await prisma.$transaction([
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
        name: 'Outro Organizador Destaques',
        email: `other-org-${randomUUID()}@eventbook.test`,
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
  const otherOrgToken = jwt.sign({ role: otherOrganizer.role }, env.JWT_SECRET, { subject: otherOrganizer.id });
  const buyerToken = jwt.sign({ role: buyer.role }, env.JWT_SECRET, { subject: buyer.id });

  const now = Date.now();
  const marker = randomUUID().slice(0, 8);
  const window = {
    salesStartsAt: new Date(now - 3_600_000),
    salesEndsAt: new Date(now + 14 * 86_400_000),
  };

  try {
    const [smallSoonest, bigPopular, curatedLater, draftEvent] = await prisma.$transaction([
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
      prisma.event.create({
        data: {
          title: `Evento Rascunho Destaque ${marker}`,
          description: 'Evento em rascunho não pode ser destacado na vitrine pública.',
          location: 'Fortaleza, CE',
          startsAt: new Date(now + 12 * 86_400_000),
          endsAt: new Date(now + 12 * 86_400_000 + 10_800_000),
          capacity: 100,
          status: 'DRAFT',
          featured: false,
          organizerId: organizer.id,
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

    const otherOrgToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${otherOrgToken}`)
      .send({ featured: true });
    expect(otherOrgToggle.status).toBe(403);

    const buyerToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ featured: true });
    expect(buyerToggle.status).toBe(403);

    const draftToggle = await request(app)
      .patch(`/events/${draftEvent.id}/featured`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ featured: true });
    expect(draftToggle.status).toBe(422);
    expect(draftToggle.body.code).toBe('EVENT_NOT_PUBLISHED');

    const ownerToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ featured: true });
    expect(ownerToggle.status).toBe(200);
    expect(ownerToggle.body.featured).toBe(true);

    const updatedHighlights = await request(app).get('/events/highlights?limit=10');
    expect(updatedHighlights.status).toBe(200);
    const updatedIds = (updatedHighlights.body.data as Array<{ id: string }>).map(e => e.id);
    expect(updatedIds[0]).toBe(smallSoonest.id);

    const adminToggle = await request(app)
      .patch(`/events/${smallSoonest.id}/featured`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ featured: false });
    expect(adminToggle.status).toBe(200);
    expect(adminToggle.body.featured).toBe(false);
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: organizer.id } }),
      prisma.user.deleteMany({ where: { id: { in: [admin.id, organizer.id, otherOrganizer.id, buyer.id] } } }),
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

it('oculta evento publicado em POST /events/:id/unpublish, exclui sem vendas ou arquiva com histórico em DELETE /events/:id', async () => {
  const [owner, other, buyer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: 'Organizador Dono',
        email: `owner-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'ORGANIZER',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Outro Organizador',
        email: `other-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'ORGANIZER',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Comprador Histórico',
        email: `buyer-${randomUUID()}@eventbook.test`,
        password: 'fixture-sem-login',
        role: 'BUYER',
      },
    }),
  ]);

  const ownerToken = jwt.sign({ role: owner.role }, env.JWT_SECRET, { subject: owner.id });
  const otherToken = jwt.sign({ role: other.role }, env.JWT_SECRET, { subject: other.id });
  const buyerToken = jwt.sign({ role: buyer.role }, env.JWT_SECRET, { subject: buyer.id });

  const now = Date.now();
  const marker = randomUUID().slice(0, 8);
  const startsAt = new Date(now + 48 * 3_600_000);
  const endsAt = new Date(now + 52 * 3_600_000);
  const salesWindow = {
    salesStartsAt: new Date(now - 3_600_000),
    salesEndsAt: startsAt,
  };

  try {
    const emptyEvent = await prisma.event.create({
      data: {
        title: `Evento Sem Vendas ${marker}`,
        description: 'Evento publicado sem vendas para testar ocultar e excluir.',
        location: 'Fortaleza, CE',
        startsAt,
        endsAt,
        capacity: 50,
        status: 'PUBLISHED',
        featured: true,
        organizerId: owner.id,
        lots: { create: { ...salesWindow, name: 'Lote Inicial', price: 40, totalQuantity: 50 } },
      },
    });

    const soldEvent = await prisma.event.create({
      data: {
        title: `Evento Com Vendas ${marker}`,
        description: 'Evento com pedido para testar arquivamento seguro.',
        location: 'Fortaleza, CE',
        startsAt,
        endsAt,
        capacity: 100,
        status: 'PUBLISHED',
        featured: true,
        organizerId: owner.id,
        lots: { create: { ...salesWindow, name: 'Pista', price: 80, totalQuantity: 100, soldQuantity: 1 } },
      },
      include: { lots: true },
    });

    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        eventId: soldEvent.id,
        totalAmount: 80,
        status: 'PAID',
        expiresAt: new Date(now + 900_000),
        paidAt: new Date(now),
        items: { create: { lotId: soldEvent.lots[0].id, quantity: 1, unitPriceSnapshot: 80 } },
      },
    });

    const mineBefore = await request(app)
      .get('/events/mine')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const mineListBefore = mineBefore.body.data as Array<{
      id: string;
      hasSales: boolean;
      soldTickets: number;
      reservedTickets: number;
      lotsCount: number;
      staffCount: number;
    }>;
    expect(mineListBefore.find(e => e.id === emptyEvent.id)).toMatchObject({
      hasSales: false,
      soldTickets: 0,
      reservedTickets: 0,
      lotsCount: 1,
      staffCount: 0,
    });
    expect(mineListBefore.find(e => e.id === soldEvent.id)).toMatchObject({
      hasSales: true,
      soldTickets: 1,
      reservedTickets: 0,
      lotsCount: 1,
      staffCount: 0,
    });

    await request(app)
      .post(`/events/${emptyEvent.id}/unpublish`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(app)
      .post(`/events/${emptyEvent.id}/unpublish`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(403);

    const hidden = await request(app)
      .post(`/events/${emptyEvent.id}/unpublish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(hidden.body.status).toBe('DRAFT');
    expect(hidden.body.featured).toBe(false);

    const deleted = await request(app)
      .delete(`/events/${emptyEvent.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(deleted.body.action).toBe('DELETED');
    expect(await prisma.event.findUnique({ where: { id: emptyEvent.id } })).toBeNull();
    expect(await prisma.ticketLot.count({ where: { eventId: emptyEvent.id } })).toBe(0);

    const archived = await request(app)
      .delete(`/events/${soldEvent.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(archived.body.action).toBe('ARCHIVED');
    expect(archived.body.event.status).toBe('CANCELLED');
    expect(archived.body.event.featured).toBe(false);

    expect(await prisma.order.count({ where: { eventId: soldEvent.id } })).toBe(1);

    const publicCatalog = await request(app).get(`/events?q=${marker}`).expect(200);
    expect(publicCatalog.body.data).toEqual([]);

    const publishArchived = await request(app)
      .post(`/events/${soldEvent.id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(422);
    expect(publishArchived.body.code).toBe('EVENT_ARCHIVED');

    const unpublishArchived = await request(app)
      .post(`/events/${soldEvent.id}/unpublish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(422);
    expect(unpublishArchived.body.code).toBe('EVENT_ARCHIVED');
  } finally {
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { buyerId: buyer.id } }),
      prisma.event.deleteMany({ where: { organizerId: owner.id } }),
      prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id, buyer.id] } } }),
    ]);
  }
});