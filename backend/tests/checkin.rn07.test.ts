import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { checkIn, withCheckinFixture } from './checkin.fixture.js';

afterAll(() => prisma.$disconnect());

it('exige sessão STAFF com vínculo ativo no evento selecionado', async () => {
  await withCheckinFixture(async ({ eventId, ticket, staffId, ownerAuth, staffAuth, unlinkedAuth }) => {
    await checkIn(ticket.code, eventId).expect(401);
    await checkIn(ticket.code, eventId, ownerAuth).expect(403);
    await checkIn(ticket.code, eventId, unlinkedAuth).expect(403);
    await checkIn(ticket.code, 'id-invalido', staffAuth).expect(400);

    await request(app).delete('/events/' + eventId + '/staff/' + staffId)
      .set('Authorization', ownerAuth).expect(204);
    await checkIn(ticket.code, eventId, staffAuth).expect(403);
    expect(await prisma.checkIn.count({ where: { ticketId: ticket.id } })).toBe(0);
  });
});

it('diferencia código inexistente e ingresso de outro evento', async () => {
  await withCheckinFixture(async ({ eventId, staffAuth, foreign }) => {
    const missing = await checkIn(randomUUID(), eventId, staffAuth).expect(404);
    expect(missing.body.code).toBe('TICKET_NOT_FOUND');
    const wrong = await checkIn(foreign.code, eventId, staffAuth).expect(422);
    expect(wrong.body.code).toBe('TICKET_WRONG_EVENT');
    expect(await prisma.checkIn.count({ where: { ticketId: foreign.id } })).toBe(0);
  });
});

it('bloqueia ingressos cancelados e ingressos usados antes da tabela de check-in', async () => {
  await withCheckinFixture(async ({ eventId, staffAuth, cancelled, used }) => {
    const invalid = await checkIn(cancelled.code, eventId, staffAuth).expect(422);
    expect(invalid.body.code).toBe('TICKET_INVALID');
    const duplicate = await checkIn(used.code, eventId, staffAuth).expect(409);
    expect(duplicate.body.code).toBe('TICKET_ALREADY_USED');
    expect(await prisma.checkIn.count({ where: { ticketId: { in: [cancelled.id, used.id] } } })).toBe(0);
  });
});

it('respeita o registro existente mesmo quando o status antigo diverge', async () => {
  await withCheckinFixture(async ({ eventId, staffId, staffAuth, ticket }) => {
    await prisma.checkIn.create({ data: { ticketId: ticket.id, staffId } });
    const duplicate = await checkIn(ticket.code, eventId, staffAuth).expect(409);
    expect(duplicate.body.code).toBe('TICKET_ALREADY_USED');
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored).toMatchObject({ status: 'VALID', usedAt: null });
    expect(await prisma.checkIn.count({ where: { ticketId: ticket.id } })).toBe(1);
  });
});

it('registra uma única entrada quando dois membros do staff tentam o mesmo ingresso', async () => {
  await withCheckinFixture(async ({ eventId, staffId, secondStaffId, staffAuth, secondStaffAuth, ticket }) => {
    const responses = await Promise.all([
      checkIn(ticket.code, eventId, staffAuth),
      checkIn(ticket.code, eventId, secondStaffAuth),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body.code).toBe('TICKET_ALREADY_USED');

    const saved = await prisma.checkIn.findUniqueOrThrow({ where: { ticketId: ticket.id } });
    expect([staffId, secondStaffId]).toContain(saved.staffId);
    const result = responses.find(response => response.status === 201)?.body;
    expect(result).toMatchObject({
      id: saved.id, ticketId: ticket.id, eventId, status: 'USED', checkedInAt: saved.checkedInAt.toISOString(),
    });
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored).toMatchObject({ status: 'USED', usedAt: saved.checkedInAt });
    expect(await prisma.checkIn.count({ where: { ticketId: ticket.id } })).toBe(1);
  });
});
