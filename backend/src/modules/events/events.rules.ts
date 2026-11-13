import { AppError } from '../../shared/errors/AppError.js';

/**
 * RN-01: Evento passado não pode ser editado
 */
export function assertEventNotInPast(startsAt: Date, now: Date = new Date()): void {
  if (startsAt.getTime() <= now.getTime()) {
    throw new AppError(
      'EVENT_IN_PAST',
      'Eventos que já iniciaram ou passaram não podem ser editados (RN-01)',
      422
    );
  }
}

/**
 * RN-01: Evento sem lotes não pode ser publicado
 */
export function assertEventHasLotsForPublish(lotsCount: number): void {
  if (lotsCount <= 0) {
    throw new AppError(
      'EVENT_WITHOUT_LOTS',
      'O evento precisa de ter pelo menos um lote registado para ser publicado (RN-01)',
      422
    );
  }
}

/**
 * Valida se a data de término é posterior à data de início
 */
export function assertValidEventDates(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError(
      'INVALID_EVENT_DATES',
      'A data de término do evento deve ser posterior à data de início',
      400
    );
  }
}