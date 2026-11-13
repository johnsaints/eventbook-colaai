import { EventStatus, OrderStatus, Prisma, TicketStatus, type OrderItem } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { toPage, type PaginationQuery } from '../../shared/pagination.js';
import { lockEventForWrite } from '../events/events.repository.js';
import { expirePendingOrders, releaseReservedItems } from './orders.expiration.js';
import type { CreateOrderInput } from './orders.schema.js';

const reservationDurationMs = 15 * 60_000;
const paidCancellationLeadTimeMs = 12 * 60 * 60_000;

const orderSelect = {
  id: true,
  eventId: true,
  status: true,
  totalAmount: true,
  createdAt: true,
  expiresAt: true,
} satisfies Prisma.OrderSelect;

const orderDetailsSelect = {
  ...orderSelect,
  cancelledAt: true,
  items: {
    orderBy: { lotId: 'asc' },
    select: { lotId: true, quantity: true, unitPriceSnapshot: true },
  },
} satisfies Prisma.OrderSelect;

function toOrderResponse<T extends {
  totalAmount: Prisma.Decimal;
  items: Pick<OrderItem, 'lotId' | 'quantity' | 'unitPriceSnapshot'>[];
}>({ totalAmount, items, ...order }: T) {
  return {
    ...order,
    totalAmount: totalAmount.toFixed(2),
    items: items.map(item => ({ ...item, unitPriceSnapshot: item.unitPriceSnapshot.toFixed(2) })),
  };
}

function orderNotFound() {
  return new AppError('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
}

export async function createOrder(buyerId: string, { eventId, items }: CreateOrderInput) {
  const result = await prisma.$transaction(async (tx) => {
    const event = await lockEventForWrite(tx, eventId);
    if (event.status !== EventStatus.PUBLISHED) {
      throw new AppError('EVENT_NOT_FOUND', 'Evento não encontrado', 404);
    }

    const now = new Date();
    const lotIds = items.map(item => item.lotId);
    await expirePendingOrders(tx, eventId, now, {
      items: { some: { lotId: { in: lotIds } } },
    });

    const lots = await tx.ticketLot.findMany({ where: { eventId, id: { in: lotIds } } });
    const lotsById = new Map(lots.map(lot => [lot.id, lot]));
    const orderItems = [];
    let totalAmount = new Prisma.Decimal(0);

    // Devolve recusas previstas após o commit para preservar a expiração já aplicada.
    for (const { lotId, quantity } of items) {
      const lot = lotsById.get(lotId);
      if (!lot) return new AppError('LOT_NOT_FOUND', 'Lote não encontrado.', 404);
      if (!lot.active) return new AppError('LOT_INACTIVE', 'Este lote está inativo.', 422);
      if (now < lot.salesStartsAt || now > lot.salesEndsAt) {
        return new AppError('LOT_OUT_OF_SALE_WINDOW', 'Lote fora da janela de venda.', 422);
      }

      const available = lot.totalQuantity - lot.soldQuantity - lot.reservedQty;
      if (quantity > available) {
        return new AppError('INSUFFICIENT_STOCK', 'Quantidade superior ao estoque disponível.', 409);
      }

      orderItems.push({ lotId, quantity, unitPriceSnapshot: lot.price });
      totalAmount = totalAmount.plus(lot.price.times(quantity));
    }

    const order = await tx.order.create({
      data: {
        eventId,
        buyerId,
        totalAmount,
        createdAt: now,
        expiresAt: new Date(now.getTime() + reservationDurationMs),
        items: { create: orderItems },
      },
      select: orderSelect,
    });

    for (const { lotId, quantity } of orderItems) {
      await tx.ticketLot.update({
        where: { id: lotId },
        data: { reservedQty: { increment: quantity } },
      });
    }

    return toOrderResponse({ ...order, items: orderItems });
  }, { isolationLevel: 'ReadCommitted' });

  if (result instanceof AppError) throw result;
  return result;
}

function visibleOrderStatus(order: { status: OrderStatus; expiresAt: Date }, now: number) {
  return order.status === OrderStatus.PENDING && order.expiresAt.getTime() <= now
    ? OrderStatus.EXPIRED
    : order.status;
}

export async function listMyOrders(buyerId: string, query: PaginationQuery) {
  const { page, limit } = query;
  const where = { buyerId };
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        ...orderSelect,
        paidAt: true,
        cancelledAt: true,
        event: { select: { id: true, title: true, startsAt: true, location: true } },
      },
    }),
    prisma.order.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });

  const now = Date.now();
  const data = orders.map(order => ({
    ...order,
    status: visibleOrderStatus(order, now),
    totalAmount: order.totalAmount.toFixed(2),
  }));
  return toPage(data, total, query);
}

export async function getOrder(buyerId: string, id: string) {
  const order = await prisma.order.findUnique({
    where: { id, buyerId },
    select: orderDetailsSelect,
  });
  if (!order) throw orderNotFound();

  return toOrderResponse({ ...order, status: visibleOrderStatus(order, Date.now()) });
}

export async function cancelOrder(buyerId: string, id: string) {
  const where = { id, buyerId };
  const ownedOrder = await prisma.order.findUnique({ where, select: { eventId: true } });
  if (!ownedOrder) throw orderNotFound();

  const { eventId } = ownedOrder;
  const result = await prisma.$transaction(async tx => {
    const event = await lockEventForWrite(tx, eventId);
    const order = await tx.order.findUnique({ where, select: orderDetailsSelect });
    if (!order) throw orderNotFound();
    if (order.status === OrderStatus.CANCELLED) return toOrderResponse(order);

    const now = new Date();
    const pending = order.status === OrderStatus.PENDING;
    const paid = order.status === OrderStatus.PAID;
    if (order.status === OrderStatus.EXPIRED || (pending && order.expiresAt <= now)) {
      if (pending) await expirePendingOrders(tx, eventId, now, { id });
      return new AppError('ORDER_EXPIRED', 'A reserva deste pedido expirou.', 422);
    }
    if (!pending && !paid) {
      throw new AppError('ORDER_NOT_PENDING', 'Este pedido não pode ser cancelado.', 409);
    }
    if (paid && event.startsAt.getTime() - now.getTime() < paidCancellationLeadTimeMs) {
      throw new AppError(
        'CANCELLATION_WINDOW_CLOSED',
        'Pedidos pagos podem ser cancelados até 12 horas antes do início do evento.',
        422
      );
    }

    const updated = await tx.order.update({
      where: { ...where, status: order.status },
      data: { status: OrderStatus.CANCELLED, cancelledAt: now },
      select: orderDetailsSelect,
    });
    if (paid) {
      await tx.ticket.updateMany({
        where: { orderId: id },
        data: { status: TicketStatus.CANCELLED },
      });
      for (const { lotId, quantity } of order.items) {
        const released = await tx.ticketLot.updateMany({
          where: { id: lotId, eventId, soldQuantity: { gte: quantity } },
          data: { soldQuantity: { decrement: quantity } },
        });
        if (released.count !== 1) {
          throw new Error('Estoque vendido incompatível com o lote ' + lotId);
        }
      }
    } else {
      await releaseReservedItems(tx, eventId, order.items);
    }
    return toOrderResponse(updated);
  }, { isolationLevel: 'ReadCommitted' });

  if (result instanceof AppError) throw result;
  return result;
}
