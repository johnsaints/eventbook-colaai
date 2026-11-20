import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import { paginationQuerySchema } from '../../shared/pagination.js';
import { checkoutOrder } from './orders.checkout.js';
import { createOrderSchema, orderParamsSchema } from './orders.schema.js';
import { cancelOrder, createOrder, getOrder, listMyOrders } from './orders.service.js';

export const ordersRoutes = Router();

ordersRoutes.post('/orders', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const order = await createOrder(req.user!.id, input);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

ordersRoutes.get('/orders/me', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const orders = await listMyOrders(req.user!.id, query);
    res.set('Cache-Control', 'no-store').status(200).json(orders);
  } catch (error) {
    next(error);
  }
});

ordersRoutes.get('/orders/:id', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = orderParamsSchema.parse(req.params);
    const order = await getOrder(req.user!.id, id);
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
});

ordersRoutes.post('/orders/:id/cancel', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = orderParamsSchema.parse(req.params);
    const order = await cancelOrder(req.user!.id, id);
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
});

ordersRoutes.post('/orders/:id/checkout', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = orderParamsSchema.parse(req.params);
    const result = await checkoutOrder(req.user!.id, id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
