import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';

interface JwtPayload {
  sub: string;
  role: Role;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Token de autenticação não fornecido', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    next();
  } catch {
    throw new AppError('UNAUTHORIZED', 'Token inválido ou expirado', 401);
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
  } catch {
    // Em rotas públicas/mistas, ignora token inválido e segue como visitante
  }

  next();
}

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Usuário não autenticado', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Sem permissão para acessar este recurso', 403);
    }

    next();
  };
}