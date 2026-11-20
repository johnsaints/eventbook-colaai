import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import { addEventStaff, listAssignedEvents, listEventStaff, removeEventStaff } from './staff.service.js';

export const staffRoutes = Router();

const uuid = z.guid().transform(value => value.toLowerCase());
const eventParams = z.object({ id: uuid });
const removalParams = eventParams.extend({ userId: uuid });
const addStaffBody = z.object({
  email: z.string().trim().email().max(191).transform(value => value.toLowerCase()),
}).strict();

staffRoutes.get('/staff/events', authenticate, authorize(Role.STAFF, Role.ADMIN), async (req, res, next) => {
  try {
    const events = await listAssignedEvents(req.user!.id, req.user!.role);
    res.set('Cache-Control', 'no-store').status(200).json(events);
  } catch (error) {
    next(error);
  }
});

staffRoutes.get('/events/:id/staff', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { id } = eventParams.parse(req.params);
    const members = await listEventStaff(id, req.user!.id);
    res.set('Cache-Control', 'no-store').status(200).json(members);
  } catch (error) {
    next(error);
  }
});

staffRoutes.post('/events/:id/staff', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { id } = eventParams.parse(req.params);
    const { email } = addStaffBody.parse(req.body);
    const member = await addEventStaff(id, req.user!.id, email);
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
});

staffRoutes.delete('/events/:id/staff/:userId', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { id, userId } = removalParams.parse(req.params);
    await removeEventStaff(id, req.user!.id, userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
