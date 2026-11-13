import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details ?? null,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Payload inválido',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  const requestId = res.getHeader('X-Request-Id');
  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify({
      event: 'http_error',
      requestId,
      errorType: err instanceof Error ? err.name : 'UnknownError',
    }));
  } else {
    console.error('[Unhandled Error]', { requestId }, err);
  }
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Erro interno do servidor',
    details: null,
  });
}
