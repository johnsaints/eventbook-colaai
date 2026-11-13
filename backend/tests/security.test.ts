import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

const allowedOrigin = env.CORS_ORIGINS[0];
const blockedOrigin = 'https://frontend-' + randomUUID() + '.invalid';

afterAll(() => prisma.$disconnect());

it('envia cabeçalhos de segurança no healthcheck', async () => {
  const response = await request(app).get('/health').expect(200);
  expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('correlaciona requisições distintas com IDs atribuídos pela API', async () => {
  const first = await request(app).get('/health').set('Origin', allowedOrigin).expect(200);

  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  expect(first.headers['x-request-id']).toMatch(uuid);
  const second = await request(app).get('/health').set('X-Request-Id', first.headers['x-request-id']).expect(200);
  expect(second.headers['x-request-id']).toMatch(uuid);
  expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
  expect(first.headers['access-control-expose-headers']).toContain('X-Request-Id');
});

it('libera CORS apenas para as origens configuradas', async () => {
  const allowed = await request(app).get('/health').set('Origin', allowedOrigin).expect(200);
  expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
  expect(allowed.headers.vary).toContain('Origin');

  const blocked = await request(app).get('/health').set('Origin', blockedOrigin).expect(200);
  expect(blocked.headers['access-control-allow-origin']).toBeUndefined();

  const withoutOrigin = await request(app).get('/health').expect(200);
  expect(withoutOrigin.headers['access-control-allow-origin']).toBeUndefined();
});

it('responde ao preflight do frontend autorizado sem liberar outra origem', async () => {
  const preflight = (origin: string) => request(app).options('/login')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');

  const allowed = await preflight(allowedOrigin).expect(204);
  expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
  expect(allowed.headers['access-control-allow-methods']).toContain('POST');
  expect(allowed.headers['access-control-allow-headers']).toContain('authorization,content-type');

  const blocked = await preflight(blockedOrigin).expect(204);
  expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
});

it('permite cadastro e login e limita as duas rotas na mesma janela por IP', async () => {
  const email = randomUUID() + '@eventbook.test';
  const password = 'SenhaTeste-914';
  const client = request(app);

  try {
    await client.post('/register').send({ name: 'Teste de segurança', email, password }).expect(201);
    const { body } = await client.post('/login').send({ email, password }).expect(200);

    for (let attempt = 0; attempt < 8; attempt++) {
      const path = attempt % 2 === 0 ? '/login' : '/register';
      await client.post(path).send({}).expect(400);
    }

    for (const path of ['/login', '/register']) {
      const blocked = await client.post(path).set('Origin', allowedOrigin).send({}).expect(429);
      expect(blocked.body).toEqual({
        code: 'RATE_LIMIT_EXCEEDED', message: 'Muitas tentativas. Tente novamente em alguns minutos.', details: null,
      });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.headers.ratelimit).toBeDefined();
      expect(blocked.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(blocked.headers['access-control-expose-headers']).toContain('Retry-After');
    }

    await client.get('/me').set('Authorization', 'Bearer ' + body.token).expect(200);
    await client.get('/health').expect(200);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
  }
});
