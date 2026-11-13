import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from './events.schema.js';
import { getEventOccupancy } from './events.occupancy.js';
import { EventsService } from './events.service.js';

const eventsService = new EventsService();
const occupancyParams = z.object({ id: z.guid().transform(value => value.toLowerCase()) });

export class EventsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listEventsQuerySchema.parse(req.query);
      const result = await eventsService.listPublished(query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await eventsService.listMine(req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
  
  async getOccupancy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = occupancyParams.parse(req.params);
      const occupancy = await getEventOccupancy(id, req.user!.id);
      res.set('Cache-Control', 'no-store').status(200).json(occupancy);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await eventsService.getById(String(req.params.id), req.user);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = createEventSchema.parse(req.body);
      const event = await eventsService.create(req.user!.id, payload);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = updateEventSchema.parse(req.body);
      const event = await eventsService.update(String(req.params.id), req.user!, payload);
      res.status(200).json(event);
    } catch (error) {
      next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await eventsService.publish(String(req.params.id), req.user!);
      res.status(200).json(event);
    } catch (error) {
      next(error);
    }
  }
}
