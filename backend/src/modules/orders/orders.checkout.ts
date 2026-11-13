import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/errors/AppError.js';
import { lockEventForWrite } from '../events/events.repository.js';
import { expirePendingOrders } from './orders.expiration.js';

// SOLID (DIP): o checkout depende do contrato PaymentGateway.
// Os testes podem trocar o simulador por outro gateway sem alterar a transação.
type PaymentGateway = {
  approve(payment: { orderId: string; totalAmount: string }): boolean;
};

const simulatedGateway: PaymentGateway = { approve: () => true };
const ticketBatchSize = 500;

export async function checkoutOrder(
  buyerId: string,
  id: string,
  gateway: PaymentGateway = simulatedGateway
) {
  const where = { id, buyerId };
  const ownedOrder = await prisma.order.findUnique({ where, select: { eventId: true } });
  if (!ownedOrder) throw new AppError('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);

  const { eventId } = ownedOrder;
  const result = await prisma.$transaction(async tx => {
    await lockEventForWrite(tx, eventId);
    const order = await tx.order.findUnique({
      where,
      select: {
        status: true, expiresAt: true, totalAmount: true,
        items: { orderBy: { lotId: 'asc' }, select: { lotId: true, quantity: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
    if (order.status === OrderStatus.PAID) {
      throw new AppError('ORDER_ALREADY_PAID', 'Este pedido já foi pago.', 409);
    }

    const now = new Date();
    const pending = order.status === OrderStatus.PENDING;
    if (order.status === OrderStatus.EXPIRED || (pending && order.expiresAt <= now)) {
      if (pending) await expirePendingOrders(tx, eventId, now, { id });
      return new AppError('ORDER_EXPIRED', 'A reserva deste pedido expirou.', 422);
    }
    if (!pending) {
      throw new AppError('ORDER_NOT_PENDING', 'Apenas pedidos pendentes podem ser pagos.', 409);
    }
    if (order.items.length === 0) throw new Error('Pedido pendente sem itens: ' + id);

    const totalAmount = order.totalAmount.toFixed(2);
    if (!gateway.approve({ orderId: id, totalAmount })) {
      throw new AppError('PAYMENT_DECLINED', 'O pagamento simulado foi recusado.', 422);
    }

    let ticketCount = 0;
    for (const { lotId, quantity } of order.items) {
      const converted = await tx.ticketLot.updateMany({
        where: { id: lotId, eventId, reservedQty: { gte: quantity } },
        data: {
          reservedQty: { decrement: quantity },
          soldQuantity: { increment: quantity },
        },
      });
      if (converted.count !== 1) throw new Error('Reserva incompatível com o estoque do lote ' + lotId);

      for (let offset = 0; offset < quantity; offset += ticketBatchSize) {
        const size = Math.min(ticketBatchSize, quantity - offset);
        const created = await tx.ticket.createMany({
          data: Array.from({ length: size }, () => ({ code: randomUUID(), orderId: id, eventId, lotId })),
        });
        ticketCount += created.count;
      }
    }

    const paid = await tx.order.update({
      where: { ...where, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID, paidAt: now },
      select: { id: true, eventId: true, status: true, paidAt: true },
    });
    return { ...paid, totalAmount, ticketCount };
  }, { isolationLevel: 'ReadCommitted' });

  if (result instanceof AppError) throw result;
  return result;
}
