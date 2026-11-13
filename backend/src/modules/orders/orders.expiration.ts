import { OrderStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { lockEventForWrite } from '../events/events.repository.js';

const batchSize = 100;
const intervalMs = 60_000;

// O chamador deve adquirir o lock do evento antes de liberar o estoque.
export async function releaseReservedItems(
  tx: Prisma.TransactionClient,
  eventId: string,
  items: { lotId: string; quantity: number }[]
) {
  for (const { lotId, quantity } of items) {
    const released = await tx.ticketLot.updateMany({
      where: { id: lotId, eventId, reservedQty: { gte: quantity } },
      data: { reservedQty: { decrement: quantity } },
    });
    if (released.count !== 1) {
      throw new Error('Reserva incompatível com o estoque do lote ' + lotId);
    }
  }
}

// O chamador deve adquirir o lock do evento antes de executar esta função.
export async function expirePendingOrders(
  tx: Prisma.TransactionClient,
  eventId: string,
  cutoff: Date,
  scope: Pick<Prisma.OrderWhereInput, 'id' | 'items'>
) {
  const pending = { eventId, status: OrderStatus.PENDING, expiresAt: { lte: cutoff } };
  const orders = await tx.order.findMany({
    where: { ...pending, ...scope },
    select: { id: true, items: { select: { lotId: true, quantity: true } } },
  });

  let expired = 0;
  for (const order of orders) {
    const changed = await tx.order.updateMany({
      where: { ...pending, id: order.id },
      data: { status: OrderStatus.EXPIRED },
    });
    if (changed.count === 0) continue;

    await releaseReservedItems(tx, eventId, order.items);
    expired += 1;
  }
  return expired;
}

export async function expireDueOrders(cutoff = new Date()) {
  let cursor: { expiresAt: Date; id: string } | undefined;
  let expired = 0;
  const failures: Error[] = [];

  while (true) {
    const afterCursor = cursor && [
      { expiresAt: { gt: cursor.expiresAt } },
      { expiresAt: cursor.expiresAt, id: { gt: cursor.id } },
    ];
    const candidates = await prisma.order.findMany({
      where: { status: OrderStatus.PENDING, expiresAt: { lte: cutoff }, OR: afterCursor },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      select: { id: true, eventId: true, expiresAt: true },
    });

    const ordersByEvent = new Map<string, string[]>();
    for (const { id, eventId } of candidates) {
      const orderIds = ordersByEvent.get(eventId);
      if (orderIds) orderIds.push(id);
      else ordersByEvent.set(eventId, [id]);
    }

    for (const [eventId, orderIds] of ordersByEvent) {
      try {
        expired += await prisma.$transaction(async tx => {
          await lockEventForWrite(tx, eventId);
          return expirePendingOrders(tx, eventId, cutoff, { id: { in: orderIds } });
        }, { isolationLevel: 'ReadCommitted' });
      } catch (error) {
        failures.push(new Error('Falha ao expirar reservas do evento ' + eventId, { cause: error }));
      }
    }

    if (candidates.length < batchSize) break;
    cursor = candidates[candidates.length - 1];
  }

  if (failures.length) throw new AggregateError(failures, 'Falha na expiração de reservas.');
  return expired;
}

export function startOrderExpirationJob() {
  async function run() {
    try {
      await expireDueOrders();
    } catch (error) {
      console.error('[Expiração de reservas]', error);
    } finally {
      setTimeout(() => void run(), intervalMs).unref();
    }
  }

  void run();
}
