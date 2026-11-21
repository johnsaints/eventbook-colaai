import { NextFunction, Request, Response } from 'express';
import {
  adminListUsersQuerySchema,
  adminUpdateUserRoleSchema,
  adminUserParamsSchema,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  requestMagicLinkSchema,
  updateProfileSchema,
  verifyMagicLinkSchema,
} from './auth.schema.js';
import { AuthService } from './auth.service.js';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = registerSchema.parse(req.body);
      const user = await authService.register(payload);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = loginSchema.parse(req.body);
      const result = await authService.login(payload);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getProfile(req.user!.id);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = updateProfileSchema.parse(req.body);
      const user = await authService.updateProfile(req.user!.id, payload);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = changePasswordSchema.parse(req.body);
      const result = await authService.changePassword(req.user!.id, payload);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async requestMagicLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = requestMagicLinkSchema.parse(req.body);
      const result = await authService.requestMagicLink(payload.email);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async verifyMagicLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = verifyMagicLinkSchema.parse(req.body);
      const session = await authService.verifyMagicLink(payload.token, payload.rememberMe);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  }

  async listUsersForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminListUsersQuerySchema.parse(req.query);
      const result = await authService.listUsersForAdmin(query);
      res.set('Cache-Control', 'no-store').status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateUserRoleByAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = adminUserParamsSchema.parse(req.params);
      const { role } = adminUpdateUserRoleSchema.parse(req.body);
      const user = await authService.updateUserRoleByAdmin(req.user!.id, id, role);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }
}
