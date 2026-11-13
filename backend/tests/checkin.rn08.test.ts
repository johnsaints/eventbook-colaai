import { afterAll, expect, it, vi } from 'vitest';
import { checkIn, withCheckinFixture } from './checkin.fixture.js';
import { prisma } from '../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

it.each([
  ['1 ms antes da abertura', '2030-02-02T00:59:59.999Z', 422],
  ['na abertura', '2030-02-02T01:00:00.000Z', 201],
  ['no encerramento', '2030-02-02T05:00:00.000Z', 201],
  ['1 ms depois do encerramento', '2030-02-02T05:00:00.001Z', 422],
] as const)('aplica a janela de check-in %s em UTC', async (_label, iso, expectedStatus) => {
  await withCheckinFixture(async ({ eventId, staffAuth, ticket }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(iso));
      const response = await checkIn(ticket.code, eventId, staffAuth).expect(expectedStatus);
      if (expectedStatus === 201) {
        expect(response.body.checkedInAt).toBe(iso);
      } else {
        expect(response.body.code).toBe('CHECKIN_WINDOW_CLOSED');
        expect(await prisma.checkIn.count({ where: { ticketId: ticket.id } })).toBe(0);
        const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        expect(stored).toMatchObject({ status: 'VALID', usedAt: null });
      }
    } finally {
      vi.useRealTimers();
    }
  }, new Date('2030-02-02T03:00:00.000Z'));
});
