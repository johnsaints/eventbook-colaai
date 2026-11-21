import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import {
  addEventStaff,
  addOrganizerDefaultStaff,
  applyDefaultStaffToEvent,
  listAssignedEvents,
  listEventStaff,
  listOrganizerDefaultStaff,
  provisionStaffMember,
  removeEventStaff,
  removeOrganizerDefaultStaff,
  searchStaffCandidates,
} from './staff.service.js';

export const staffRoutes = Router();

const uuid = z.guid().transform(value => value.toLowerCase());
const eventParams = z.object({ id: uuid });
const userParams = z.object({ userId: uuid });
const removalParams = eventParams.extend({ userId: uuid });
const addStaffBody = z.object({
  email: z.string().trim().email().max(191).transform(value => value.toLowerCase()),
}).strict();
const candidatesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  eventId: uuid.optional(),
});
const provisionStaffBody = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().trim().email('E-mail inválido').max(191).transform(value => value.toLowerCase()),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(128).optional(),
  addToDefaultTeam: z.boolean().optional().default(true),
  eventId: uuid.optional(),
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

staffRoutes.post('/events/:id/staff/apply-default', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { id } = eventParams.parse(req.params);
    const result = await applyDefaultStaffToEvent(id, req.user!.id);
    res.set('Cache-Control', 'no-store').status(200).json(result);
  } catch (error) {
    next(error);
  }
});

staffRoutes.get('/organizer/staff', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const members = await listOrganizerDefaultStaff(req.user!.id);
    res.set('Cache-Control', 'no-store').status(200).json(members);
  } catch (error) {
    next(error);
  }
});

staffRoutes.post('/organizer/staff', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { email } = addStaffBody.parse(req.body);
    const member = await addOrganizerDefaultStaff(req.user!.id, email);
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
});

staffRoutes.delete('/organizer/staff/:userId', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const { userId } = userParams.parse(req.params);
    await removeOrganizerDefaultStaff(req.user!.id, userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

staffRoutes.get('/organizer/staff/candidates', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const query = candidatesQuery.parse(req.query);
    const candidates = await searchStaffCandidates(req.user!.id, query);
    res.set('Cache-Control', 'no-store').status(200).json(candidates);
  } catch (error) {
    next(error);
  }
});

staffRoutes.post('/organizer/staff/provision', authenticate, authorize(Role.ORGANIZER), async (req, res, next) => {
  try {
    const payload = provisionStaffBody.parse(req.body);
    const result = await provisionStaffMember(req.user!.id, payload);
    res.set('Cache-Control', 'no-store').status(201).json(result);
  } catch (error) {
    next(error);
  }
});
