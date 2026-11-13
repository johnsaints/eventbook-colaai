import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const originSchema = z.string().url().pipe(z.string().refine(value => {
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}, 'Use uma origem HTTP(S) sem caminho nem barra final.'));

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  SEED_PASSWORD: z.string().optional(),
  CORS_ORIGINS: z.string()
    .transform(value => value.split(',').map(origin => origin.trim()))
    .pipe(z.array(originSchema))
    .optional(),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV === 'production' && !config.CORS_ORIGINS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'Defina as origens do frontend em produção.',
    });
  }
}).transform(config => ({
  ...config,
  CORS_ORIGINS: config.CORS_ORIGINS ?? localOrigins,
}));

export const env = envSchema.parse(process.env);
