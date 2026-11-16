import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { AppError } from './shared/errors/AppError.js';
import { errorHandler } from './shared/middlewares/errorHandler.js';
import { lotsRoutes } from './modules/lots/lots.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { ticketsRoutes } from './modules/tickets/tickets.routes.js';
import { staffRoutes } from './modules/staff/staff.routes.js';

export const app = express();

const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('RATE_LIMIT_EXCEEDED', 'Muitas tentativas. Tente novamente em alguns minutos.', 429));
  },
});

app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = performance.now();
  res.setHeader('X-Request-Id', requestId);

  if (env.NODE_ENV !== 'test') {
    res.once('finish', () => {
      const route: unknown = req.route?.path;
      console.log(JSON.stringify({
        event: 'http_request',
        requestId,
        method: req.method,
        route: typeof route === 'string' ? route : '(sem rota)',
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    });
  }
  next();
});

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, exposedHeaders: ['Retry-After', 'X-Request-Id'] }));
app.post(['/login', '/register'], authRateLimit);
app.use(express.json({ limit: '2mb' }));

// Rota pública de Healthcheck (M01)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas de Autenticação (M02)
app.use(authRoutes);

// Rotas de Eventos (M03)
app.use(eventsRoutes);

app.use(lotsRoutes);
app.use(ordersRoutes);
app.use(ticketsRoutes);
app.use(staffRoutes);

// Tratamento global de erros no formato { code, message, details }
app.use(errorHandler);
