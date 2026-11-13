import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from '../../shared/middlewares/auth.js';
import { EventsController } from './events.controller.js';

export const eventsRoutes = Router();
const eventsController = new EventsController();

eventsRoutes.get('/events', (req, res, next) =>
  eventsController.list(req, res, next)
);

eventsRoutes.get(
  '/events/mine',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  (req, res, next) => eventsController.listMine(req, res, next)
);

eventsRoutes.get(
  '/events/:id/occupancy',
  authenticate,
  authorize(Role.ORGANIZER),
  (req, res, next) => eventsController.getOccupancy(req, res, next)
);

eventsRoutes.get('/events/:id', optionalAuthenticate, (req, res, next) =>
  eventsController.getById(req, res, next)
);

eventsRoutes.post(
  '/events',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  (req, res, next) => eventsController.create(req, res, next)
);

eventsRoutes.patch(
  '/events/:id',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  (req, res, next) => eventsController.update(req, res, next)
);

eventsRoutes.post(
  '/events/:id/publish',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  (req, res, next) => eventsController.publish(req, res, next)
);
