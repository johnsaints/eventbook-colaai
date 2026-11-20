import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import { paginationQuerySchema, toPage } from '../../shared/pagination.js';
import { checkInTicket } from './tickets.checkin.js';

export const ticketsRoutes = Router();

ticketsRoutes.get('/tickets/me', authenticate, authorize(Role.BUYER, Role.ADMIN), async (req, res, next) => {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const { page, limit } = query;
    const where = { order: { buyerId: req.user!.id } };
    const [data, total] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          orderId: true,
          status: true,
          usedAt: true,
          createdAt: true,
          event: { select: { id: true, title: true, startsAt: true, location: true } },
          lot: { select: { id: true, name: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });

    res.set('Cache-Control', 'no-store').status(200).json(toPage(data, total, query));
  } catch (error) {
    next(error);
  }
});

const checkInParams = z.object({ code: z.string().trim().min(1).max(191) });
const checkInBody = z.object({
  eventId: z.guid().transform(value => value.toLowerCase()),
}).strict();

ticketsRoutes.post('/tickets/:code/checkin', authenticate, authorize(Role.STAFF, Role.ADMIN), async (req, res, next) => {
  try {
    const { code } = checkInParams.parse(req.params);
    const { eventId } = checkInBody.parse(req.body);
    const checkIn = await checkInTicket(eventId, code, req.user!.id, req.user!.role);
    res.status(201).json(checkIn);
  } catch (error) {
    next(error);
  }
});
