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

it('gerencia equipe padrão do organizador e aplica em 1 clique ou na criação do evento', async () => {
  await withEvents(async ({ eventId, ownerAuth, otherOrganizerAuth, staffAuth, staffId, staffEmail, buyerEmail }) => {
    await request(app).get('/organizer/staff').expect(401);
    const adminAuth = authorization(randomUUID(), 'ADMIN');
    for (const auth of [otherOrganizerAuth, staffAuth, adminAuth]) {
      const check = auth === otherOrganizerAuth ? null : auth;
      if (check) {
        await request(app).get('/organizer/staff').set('Authorization', check).expect(403);
        await request(app).post('/organizer/staff').set('Authorization', check).send({ email: staffEmail }).expect(403);
      }
      await request(app).post(`/events/${eventId}/staff/apply-default`).set('Authorization', auth).expect(403);
    }

    // Não vaza contas não-STAFF na equipe padrão
    await request(app)
      .post('/organizer/staff')
      .set('Authorization', ownerAuth)
      .send({ email: buyerEmail })
      .expect(404);

    const added = await request(app)
      .post('/organizer/staff')
      .set('Authorization', ownerAuth)
      .send({ email: staffEmail })
      .expect(201);
    expect(added.body).toEqual({
      userId: staffId,
      name: 'STAFF',
      email: staffEmail,
      createdAt: expect.any(String),
    });

    await request(app)
      .post('/organizer/staff')
      .set('Authorization', ownerAuth)
      .send({ email: staffEmail })
      .expect(409);

    expect((await request(app).get('/organizer/staff').set('Authorization', ownerAuth).expect(200)).body).toEqual([
      added.body,
    ]);

    // Aplica equipe padrão em evento existente de forma idempotente
    const firstApply = await request(app)
      .post(`/events/${eventId}/staff/apply-default`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(firstApply.body.addedCount).toBe(1);
    expect(firstApply.body.members.map((m: { userId: string }) => m.userId)).toEqual([staffId]);

    const secondApply = await request(app)
      .post(`/events/${eventId}/staff/apply-default`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(secondApply.body.addedCount).toBe(0);

    // Ao criar novo evento com attachDefaultTeam padrão (true), vincula automaticamente; com false, mantém vazio
    const now = Date.now();
    const baseEventPayload = {
      title: 'Evento Equipe Auto',
      description: 'Validando vínculo automático da equipe padrão.',
      location: 'Fortaleza, CE',
      capacity: 50,
      startsAt: new Date(now + 10 * 3_600_000).toISOString(),
      endsAt: new Date(now + 14 * 3_600_000).toISOString(),
    };
    const autoRes = await request(app)
      .post('/events')
      .set('Authorization', ownerAuth)
      .send(baseEventPayload)
      .expect(201);
    expect(autoRes.body.staffCount).toBe(1);
    const autoMembers = await list(autoRes.body.id, ownerAuth).expect(200);
    expect(autoMembers.body.map((m: { userId: string }) => m.userId)).toEqual([staffId]);

    const optOutRes = await request(app)
      .post('/events')
      .set('Authorization', ownerAuth)
      .send({ ...baseEventPayload, title: 'Evento Sem Equipe', attachDefaultTeam: false })
      .expect(201);
    expect(optOutRes.body.staffCount).toBe(0);
    expect((await list(optOutRes.body.id, ownerAuth).expect(200)).body).toEqual([]);

    // Remover da equipe padrão não remove retroativamente dos eventos existentes
    await request(app).delete(`/organizer/staff/${staffId}`).set('Authorization', ownerAuth).expect(204);
    expect((await request(app).get('/organizer/staff').set('Authorization', ownerAuth).expect(200)).body).toEqual([]);
    expect((await list(eventId, ownerAuth).expect(200)).body).toHaveLength(1);
  });
});

it('busca candidatos STAFF (sem vazar BUYER) e cria conta STAFF direta para o organizador', async () => {
  await withEvents(async ({ eventId, ownerAuth, otherOrganizerAuth, staffId, staffEmail, buyerEmail }) => {
    const provisionedEmail = `portaria-${randomUUID()}@eventbook.test`;
    const otherStaffEmail = `portaria-custom-${randomUUID()}@eventbook.test`;

    try {
      await request(app).post('/organizer/staff').set('Authorization', ownerAuth).send({ email: staffEmail }).expect(201);

      // Busca por candidato nunca retorna contas BUYER
      const buyerSearch = await request(app)
        .get('/organizer/staff/candidates')
        .query({ q: buyerEmail, eventId })
        .set('Authorization', ownerAuth)
        .expect(200);
      expect(buyerSearch.body).toEqual([]);

      // Busca encontra a conta STAFF priorizando inDefaultTeam e indicando assignedToEvent
      const found = await request(app)
        .get('/organizer/staff/candidates')
        .query({ q: staffEmail, eventId })
        .set('Authorization', ownerAuth)
        .expect(200);
      expect(found.body).toEqual([
        {
          userId: staffId,
          name: 'STAFF',
          email: staffEmail,
          inDefaultTeam: true,
          assignedToEvent: false,
        },
      ]);

      // Não permite criar conta STAFF com e-mail já existente (evita hijack de BUYER/ORGANIZER)
      const duplicate = await request(app)
        .post('/organizer/staff/provision')
        .set('Authorization', ownerAuth)
        .send({ name: 'Tentativa Duplicada', email: buyerEmail, addToDefaultTeam: true })
        .expect(409);
      expect(duplicate.body.code).toBe('EMAIL_ALREADY_EXISTS');

      // Não permite vincular a evento de outro organizador
      await request(app)
        .post('/organizer/staff/provision')
        .set('Authorization', otherOrganizerAuth)
        .send({ name: 'Invasor', email: otherStaffEmail, addToDefaultTeam: false, eventId })
        .expect(403);

      // Provisiona conta STAFF com senha temporária automática, salvando na equipe padrão e no evento
      const provisioned = await request(app)
        .post('/organizer/staff/provision')
        .set('Authorization', ownerAuth)
        .send({
          name: 'Portaria Direta',
          email: provisionedEmail,
          addToDefaultTeam: true,
          eventId,
        })
        .expect(201);

      expect(provisioned.body).toMatchObject({
        member: {
          name: 'Portaria Direta',
          email: provisionedEmail,
        },
        addedToDefaultTeam: true,
        assignedToEvent: true,
      });
      expect(typeof provisioned.body.temporaryPassword).toBe('string');
      expect(provisioned.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);

      // Nova conta já consegue autenticar via /login como STAFF e enxergar o evento em /staff/events
      const loginRes = await request(app)
        .post('/login')
        .send({ email: provisionedEmail, password: provisioned.body.temporaryPassword })
        .expect(200);
      expect(loginRes.body.user.role).toBe('STAFF');

      const staffEvents = await request(app)
        .get('/staff/events')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);
      expect(staffEvents.body.map((item: { id: string }) => item.id)).toEqual([eventId]);

      // Candidato recém-criado aparece na busca com ambos inDefaultTeam e assignedToEvent = true
      const afterSearch = await request(app)
        .get('/organizer/staff/candidates')
        .query({ q: provisionedEmail, eventId })
        .set('Authorization', ownerAuth)
        .expect(200);
      expect(afterSearch.body).toEqual([
        {
          userId: provisioned.body.member.userId,
          name: 'Portaria Direta',
          email: provisionedEmail,
          inDefaultTeam: true,
          assignedToEvent: true,
        },
      ]);
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [provisionedEmail, otherStaffEmail] } },
      });
    }
  });
});
