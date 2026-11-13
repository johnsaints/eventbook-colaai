import { EventStatus, Role, type Prisma, type TicketLot } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { CreateLotInput, UpdateLotInput } from './lots.schema.js';
import { lockEventForWrite } from '../events/events.repository.js';

function toLotResponse(lot: TicketLot) {
  return {
    id: lot.id,
    eventId: lot.eventId,
    name: lot.name,
    price: lot.price,
    quantity: lot.totalQuantity,
    salesStartAt: lot.salesStartsAt,
    salesEndAt: lot.salesEndsAt,
    active: lot.active,
    createdAt: lot.createdAt,
  };
}

export async function listLots(
  eventId: string,
  requester?: { id: string; role: Role }
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, status: true },
  });

  const canManage =
    requester?.role === Role.ADMIN ||
    (event !== null && requester?.id === event.organizerId);

  if (!event || (event.status !== EventStatus.PUBLISHED && !canManage)) {
    throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
  }

  const lots = await prisma.ticketLot.findMany({
    where: canManage ? { eventId } : { eventId, active: true },
    orderBy: { salesStartsAt: 'asc' },
  });

  return lots.map(toLotResponse);
}

type LotRequester = { id: string; role: Role };

function assertCanManageLots(organizerId: string, requester: LotRequester) {
  if (requester.role !== Role.ADMIN && organizerId !== requester.id) {
    throw new AppError('FORBIDDEN', 'Você não pode gerenciar lotes deste evento.', 403);
  }
}

export async function listManagedLots(eventId: string, requester: LotRequester) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerId: true,
      lots: { orderBy: [{ salesStartsAt: 'asc' }, { id: 'asc' }] },
    },
  });

  if (!event) {
    throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
  }

  assertCanManageLots(event.organizerId, requester);

  return event.lots.map((lot) => ({
    ...toLotResponse(lot),
    availableQuantity: Math.max(0, lot.totalQuantity - lot.soldQuantity - lot.reservedQty),
  }));
}

async function lockManagedEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  requester: LotRequester
) {
  const event = await lockEventForWrite(tx, eventId);
  assertCanManageLots(event.organizerId, requester);
  return event;
}

async function validateLotLimits(
  tx: Prisma.TransactionClient,
  eventId: string,
  event: { endsAt: Date; capacity: number },
  salesEndAt: Date,
  quantityChange?: number
) {
  if (salesEndAt > event.endsAt) {
    throw new AppError(
      'INVALID_SALE_WINDOW',
      'As vendas devem terminar até o fim do evento.',
      422
    );
  }

  if (quantityChange === undefined) return;

  const { _sum } = await tx.ticketLot.aggregate({
    where: { eventId },
    _sum: { totalQuantity: true },
  });

  if ((_sum.totalQuantity ?? 0) + quantityChange > event.capacity) {
    throw new AppError(
      'LOT_CAPACITY_EXCEEDED',
      'A soma das quantidades dos lotes excede a capacidade do evento.',
      422
    );
  }
}

export async function createLot(eventId: string, requester: LotRequester, input: CreateLotInput) {
  return prisma.$transaction(async (tx) => {
    const event = await lockManagedEvent(tx, eventId, requester);
    await validateLotLimits(tx, eventId, event, input.salesEndAt, input.quantity);

    const lot = await tx.ticketLot.create({
      data: {
        eventId,
        name: input.name,
        price: input.price,
        totalQuantity: input.quantity,
        salesStartsAt: input.salesStartAt,
        salesEndsAt: input.salesEndAt,
        active: input.active,
      },
    });

    return toLotResponse(lot);
  }, { isolationLevel: 'ReadCommitted' });
}

export async function updateLot(
  eventId: string,
  lotId: string,
  requester: LotRequester,
  input: UpdateLotInput
) {
  return prisma.$transaction(async (tx) => {
    const event = await lockManagedEvent(tx, eventId, requester);
    const lot = await tx.ticketLot.findFirst({ where: { id: lotId, eventId } });
    if (!lot) {
      throw new AppError('LOT_NOT_FOUND', 'Lote não encontrado.', 404);
    }

    const salesStartAt = input.salesStartAt ?? lot.salesStartsAt;
    const salesEndAt = input.salesEndAt ?? lot.salesEndsAt;
    if (salesEndAt <= salesStartAt) {
      throw new AppError('INVALID_SALE_WINDOW', 'O fim das vendas deve ser posterior ao início.', 422);
    }

    const { quantity } = input;
    if (quantity !== undefined && quantity < lot.soldQuantity + lot.reservedQty) {
      throw new AppError(
        'LOT_QUANTITY_BELOW_COMMITTED',
        'A quantidade não pode ser menor que o total vendido e reservado.',
        422
      );
    }

    const quantityChange = quantity === undefined ? undefined : quantity - lot.totalQuantity;
    await validateLotLimits(tx, eventId, event, salesEndAt, quantityChange);

    const updatedLot = await tx.ticketLot.update({
      where: { id: lotId },
      data: {
        name: input.name,
        price: input.price,
        totalQuantity: quantity,
        salesStartsAt: input.salesStartAt,
        salesEndsAt: input.salesEndAt,
        active: input.active,
      },
    });

    return toLotResponse(updatedLot);
  }, { isolationLevel: 'ReadCommitted' });
}