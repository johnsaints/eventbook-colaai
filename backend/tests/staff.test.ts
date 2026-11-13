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

function authorization(id: string, role: Role) {
  return 'Bearer ' + jwt.sign({ role }, env.JWT_SECRET, { subject: id });
}

type Fixture = {
  eventId: string;
  secondEventId: string;
  ownerAuth: string;
  otherOrganizerAuth: string;
  staffAuth: string;
  staffId: string;
  staffEmail: string;
  buyerEmail: string;
};

async function withEvents(run: (fixture: Fixture) => Promise<void>) {
  const [owner, other, staff, buyer] = await prisma.$transaction(
    (['ORGANIZER', 'ORGANIZER', 'STAFF', 'BUYER'] as const).map(role => prisma.user.create({
      data: {
        name: role, email: randomUUID() + '@eventbook.test',
        password: 'fixture-sem-login', role,
      },
    }))
  );

  try {
    const now = Date.now();
    const [first, second] = await prisma.$transaction(
      ['Evento principal', 'Segundo evento'].map(title => prisma.event.create({
        data: {
          organizerId: owner.id, title, description: 'Fixture de equipe', location: 'Fortaleza, CE',
          capacity: 5, startsAt: new Date(now + 3_600_000), endsAt: new Date(now + 7_200_000),
        },
      }))
    );
    await run({
      eventId: first.id, secondEventId: second.id,
      ownerAuth: authorization(owner.id, owner.role),
      otherOrganizerAuth: authorization(other.id, other.role),
      staffAuth: authorization(staff.id, staff.role),
      staffId: staff.id, staffEmail: staff.email, buyerEmail: buyer.email,
    });
  } finally {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { organizerId: owner.id } }),
      prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id, staff.id, buyer.id] } } }),
    ]);
  }
}

const path = (eventId: string) => '/events/' + eventId + '/staff';
const add = (eventId: string, auth: string, email: string) =>
  request(app).post(path(eventId)).set('Authorization', auth).send({ email });
const list = (eventId: string, auth: string) =>
  request(app).get(path(eventId)).set('Authorization', auth);
const remove = (eventId: string, auth: string, userId: string) =>
  request(app).delete(path(eventId) + '/' + userId).set('Authorization', auth);

it('vincula por e-mail, lista a equipe e remove apenas o vínculo do evento selecionado', async () => {
  await withEvents(async ({ eventId, secondEventId, ownerAuth, staffId, staffEmail }) => {
    expect((await list(eventId, ownerAuth).expect(200)).body).toEqual([]);
    const { body } = await add(eventId, ownerAuth, '  ' + staffEmail.toUpperCase() + '  ').expect(201);
    expect(body).toEqual({ userId: staffId, name: 'STAFF', email: staffEmail, createdAt: expect.any(String) });
    await add(secondEventId, ownerAuth, staffEmail).expect(201);
    expect((await list(eventId, ownerAuth).expect(200)).body).toEqual([body]);

    await remove(eventId, ownerAuth, staffId).expect(204);
    await remove(eventId, ownerAuth, staffId).expect(204);
    expect((await list(eventId, ownerAuth).expect(200)).body).toEqual([]);
    const second = await list(secondEventId, ownerAuth).expect(200);
    expect(second.body.map((member: { userId: string }) => member.userId)).toEqual([staffId]);
  });
});

it('reserva a gestão da equipe ao organizador dono', async () => {
  await withEvents(async ({ eventId, ownerAuth, otherOrganizerAuth, staffAuth, staffId, staffEmail }) => {
    await request(app).get(path(eventId)).expect(401);
    await add(eventId, ownerAuth, staffEmail).expect(201);
    const adminAuth = authorization(randomUUID(), 'ADMIN');
    for (const auth of [otherOrganizerAuth, staffAuth, adminAuth]) {
      await list(eventId, auth).expect(403);
      await add(eventId, auth, staffEmail).expect(403);
      await remove(eventId, auth, staffId).expect(403);
    }
    expect(await prisma.eventStaff.count({ where: { eventId } })).toBe(1);
  });
});

it('valida e-mail e identificadores e só encontra contas elegíveis para staff', async () => {
  await withEvents(async ({ eventId, ownerAuth, buyerEmail }) => {
    const invalid = await add(eventId, ownerAuth, 'invalido').expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    await list('invalido', ownerAuth).expect(400);
    await remove(eventId, ownerAuth, 'invalido').expect(400);
    const missingEvent = await list(randomUUID(), ownerAuth).expect(404);
    expect(missingEvent.body.code).toBe('EVENT_NOT_FOUND');

    const buyer = await add(eventId, ownerAuth, buyerEmail).expect(404);
    const unknown = await add(eventId, ownerAuth, randomUUID() + '@eventbook.test').expect(404);
    expect(buyer.body).toEqual(unknown.body);
    expect(buyer.body.code).toBe('STAFF_NOT_FOUND');
    expect(await prisma.eventStaff.count({ where: { eventId } })).toBe(0);
  });
});

it('cria um único vínculo quando duas requisições tentam adicionar o mesmo staff', async () => {
  await withEvents(async ({ eventId, ownerAuth, staffEmail }) => {
    const results = await Promise.all([add(eventId, ownerAuth, staffEmail), add(eventId, ownerAuth, staffEmail)]);
    expect(results.map(response => response.status).sort()).toEqual([201, 409]);
    expect(results.find(response => response.status === 409)?.body.code).toBe('STAFF_ALREADY_ASSIGNED');
    expect(await prisma.eventStaff.count({ where: { eventId } })).toBe(1);
  });
});

it('lista apenas eventos atribuídos ao staff autenticado', async () => {
  await withEvents(async ({ eventId, secondEventId, ownerAuth, staffAuth, staffId, staffEmail }) => {
    const assignedEvents = () => request(app).get('/staff/events').set('Authorization', staffAuth);

    await request(app).get('/staff/events').expect(401);
    await request(app).get('/staff/events').set('Authorization', ownerAuth).expect(403);
    expect((await assignedEvents().expect(200)).body).toEqual([]);

    await add(eventId, ownerAuth, staffEmail).expect(201);
    const response = await assignedEvents().expect(200).expect('Cache-Control', 'no-store');
    expect(response.body).toEqual([{
      id: eventId, title: 'Evento principal', location: 'Fortaleza, CE', startsAt: expect.any(String),
    }]);

    await add(secondEventId, ownerAuth, staffEmail).expect(201);
    await remove(eventId, ownerAuth, staffId).expect(204);
    expect((await assignedEvents().expect(200)).body.map((event: { id: string }) => event.id)).toEqual([secondEventId]);
  });
});
