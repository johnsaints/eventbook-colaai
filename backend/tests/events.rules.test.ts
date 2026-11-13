import { describe, expect, it } from 'vitest';
import {
  assertEventHasLotsForPublish,
  assertEventNotInPast,
  assertValidEventDates,
} from '../src/modules/events/events.rules.js';

const now = new Date('2027-01-10T12:00:00.000Z');

describe('regras de eventos (testes unitários)', () => {
  it.each([-1, 0])('recusa um evento com início a %i ms do instante atual', offset => {
    const startsAt = new Date(now.getTime() + offset);
    expect(() => assertEventNotInPast(startsAt, now)).toThrow(
      expect.objectContaining({ code: 'EVENT_IN_PAST', statusCode: 422 })
    );
  });

  it('permite editar um evento que ainda vai iniciar', () => {
    expect(() => assertEventNotInPast(new Date(now.getTime() + 1), now)).not.toThrow();
  });

  it('exige pelo menos um lote para publicar', () => {
    expect(() => assertEventHasLotsForPublish(0)).toThrow(
      expect.objectContaining({ code: 'EVENT_WITHOUT_LOTS', statusCode: 422 })
    );
    expect(() => assertEventHasLotsForPublish(1)).not.toThrow();
  });

  it.each([-1, 0])('recusa o término a %i ms do início', offset => {
    expect(() => assertValidEventDates(now, new Date(now.getTime() + offset))).toThrow(
      expect.objectContaining({ code: 'INVALID_EVENT_DATES', statusCode: 400 })
    );
  });

  it('aceita término depois do início', () => {
    expect(() => assertValidEventDates(now, new Date(now.getTime() + 1))).not.toThrow();
  });
});
