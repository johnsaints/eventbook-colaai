import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.js';
import { AuthController } from './auth.controller.js';

export const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/register', (req, res, next) => authController.register(req, res, next));
authRoutes.post('/login', (req, res, next) => authController.login(req, res, next));
authRoutes.post('/auth/magic-link', (req, res, next) => authController.requestMagicLink(req, res, next));
authRoutes.post('/auth/magic-link/verify', (req, res, next) => authController.verifyMagicLink(req, res, next));
authRoutes.get('/me', authenticate, (req, res, next) => authController.me(req, res, next));
authRoutes.patch('/me', authenticate, (req, res, next) => authController.updateMe(req, res, next));
authRoutes.put('/me/password', authenticate, (req, res, next) => authController.changePassword(req, res, next));
