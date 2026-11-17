import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const originSchema = z.string().url().pipe(z.string().refine(value => {
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}, 'Use uma origem HTTP(S) sem caminho nem barra final.'));

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  SEED_PASSWORD: optionalString,
  SEED_ON_EMPTY: z.string().optional().transform((value) => value === 'true'),
  CORS_ORIGINS: z.string()
    .transform(value => value.split(',').map(origin => origin.trim()))
    .pipe(z.array(originSchema))
    .optional(),
  APP_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    originSchema.optional(),
  ),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().default(587),
  ),
  SMTP_SECURE: z.string().optional().transform((value) => value === 'true'),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).default('ColaAí <no-reply@colaai.local>'),
  ),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV === 'production' && !config.CORS_ORIGINS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'Defina as origens do frontend em produção.',
    });
  }
}).transform(config => {
  const corsOrigins = config.CORS_ORIGINS ?? localOrigins;
  return {
    ...config,
    CORS_ORIGINS: corsOrigins,
    APP_URL: config.APP_URL ?? corsOrigins[0],
  };
});

export const env = envSchema.parse(process.env);
