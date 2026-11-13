import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate, authorize, optionalAuthenticate } from '../../shared/middlewares/auth.js';
import { createLotSchema, updateLotSchema } from './lots.schema.js';
import { createLot, listLots, listManagedLots, updateLot } from './lots.service.js';

export const lotsRoutes = Router();

lotsRoutes.get(
  '/events/:id/lots',
  optionalAuthenticate,
  async (req, res, next) => {
    try {
      const lots = await listLots(String(req.params.id), req.user);
      res.status(200).json(lots);
    } catch (error) {
      next(error);
    }
  }
);

lotsRoutes.get(
  '/events/:id/lots/manage',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  async (req, res, next) => {
    try {
      const lots = await listManagedLots(String(req.params.id), req.user!);
      res.status(200).json(lots);
    } catch (error) {
      next(error);
    }
  }
);

lotsRoutes.post(
  '/events/:id/lots',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  async (req, res, next) => {
    try {
      const input = createLotSchema.parse(req.body);
      const lot = await createLot(String(req.params.id), req.user!, input);
      res.status(201).json(lot);
    } catch (error) {
      next(error);
    }
  }
);

lotsRoutes.patch(
  '/events/:id/lots/:lotId',
  authenticate,
  authorize(Role.ORGANIZER, Role.ADMIN),
  async (req, res, next) => {
    try {
      const input = updateLotSchema.parse(req.body);
      const lot = await updateLot(String(req.params.id), String(req.params.lotId), req.user!, input);
      res.status(200).json(lot);
    } catch (error) {
      next(error);
    }
  }
);