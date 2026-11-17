import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import {
  createMagicLinkDelivery,
  MagicLinkDelivery,
  SimulatedMagicLinkDelivery,
} from '../src/modules/auth/magicLink.delivery.js';

const db = new URL(env.DATABASE_URL);
if (db.host !== 'localhost:3306' || db.pathname !== '/eventbook_test') {
  throw new Error('Este teste exige o MySQL local eventbook_test.');
}

const VALID_PNG_DATA_URL = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]).toString('base64')}`;

const SVG_ATTACK = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;

afterAll(() => prisma.$disconnect());

it('permite consultar e editar perfil completo, foto válida e bloqueia SVG ou e-mail duplicado', async () => {
  const emailA = `perfil-a-${randomUUID()}@eventbook.test`;
  const emailB = `perfil-b-${randomUUID()}@eventbook.test`;
  const password = 'SenhaPerfil-2026!';
  const client = request(app);

  try {
    const regA = await client.post('/register').send({ name: 'Ana Maria', email: emailA, password }).expect(201);
    await client.post('/register').send({ name: 'Bruno Silva', email: emailB, password }).expect(201);

    const loginRes = await client.post('/login').send({ email: emailA, password }).expect(200);
    const token: string = loginRes.body.token;

    const initialMe = await client.get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(initialMe.body).toMatchObject({
      id: regA.body.id,
      name: 'Ana Maria',
      email: emailA,
      role: 'BUYER',
      phone: null,
      city: null,
      bio: null,
      avatarImage: null,
    });
    expect(initialMe.body.password).toBeUndefined();

    // Rejeita SVG mascarado de foto de perfil
    await client
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarImage: SVG_ATTACK })
      .expect(400);

    // Rejeita alteração de e-mail para conta já existente (409)
    const duplicateRes = await client
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: emailB })
      .expect(409);
    expect(duplicateRes.body.code).toBe('EMAIL_ALREADY_EXISTS');

    // Atualiza cadastro completo com foto válida e ignora tentativa de enviar role indevido
    const updatedRes = await client
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ana Maria Souza',
        phone: '(85) 99999-1234',
        city: 'Fortaleza, CE',
        bio: 'Fã de música independente e festivais.',
        avatarImage: VALID_PNG_DATA_URL,
        role: 'ADMIN',
      })
      .expect(200);

    expect(updatedRes.body).toMatchObject({
      name: 'Ana Maria Souza',
      email: emailA,
      role: 'BUYER',
      phone: '(85) 99999-1234',
      city: 'Fortaleza, CE',
      bio: 'Fã de música independente e festivais.',
      avatarImage: VALID_PNG_DATA_URL,
    });

    // Remove foto e limpa campos opcionais enviando vazio/null
    const clearedRes = await client
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '', bio: null, avatarImage: null })
      .expect(200);
    expect(clearedRes.body.phone).toBeNull();
    expect(clearedRes.body.bio).toBeNull();
    expect(clearedRes.body.avatarImage).toBeNull();
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
  }
});

it('exige senha atual correta ao trocar a senha do usuário autenticado', async () => {
  const email = `senha-${randomUUID()}@eventbook.test`;
  const oldPassword = 'SenhaAntiga-123!';
  const newPassword = 'SenhaNova-456!';
  const client = request(app);

  try {
    await client.post('/register').send({ name: 'Carlos', email, password: oldPassword }).expect(201);
    const { body: session } = await client.post('/login').send({ email, password: oldPassword }).expect(200);

    await client
      .put('/me/password')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ currentPassword: 'errada', newPassword })
      .expect(401);

    await client
      .put('/me/password')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(200);

    await client.post('/login').send({ email, password: oldPassword }).expect(401);
    await client.post('/login').send({ email, password: newPassword }).expect(200);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
  }
});

it('gera, armazena hash SHA-256 e consome Link Mágico de uso único sem vazar enumeração ou reuso', async () => {
  const email = `magic-${randomUUID()}@eventbook.test`;
  const client = request(app);

  try {
    const user = await prisma.user.create({
      data: {
        name: 'Julia Mágica',
        email,
        password: await bcrypt.hash('Segredo-123!', 10),
        role: 'BUYER',
      },
    });

    // Conta inexistente recebe resposta genérica sem previewUrl (previne enumeração de e-mails)
    const unknownRes = await client
      .post('/auth/magic-link')
      .send({ email: `naoexiste-${randomUUID()}@eventbook.test` })
      .expect(200);
    expect(unknownRes.body.previewUrl).toBeUndefined();

    // Solicita link mágico para conta válida
    const reqRes = await client
      .post('/auth/magic-link')
      .send({ email })
      .expect(200);
    expect(typeof reqRes.body.previewUrl).toBe('string');

    const rawToken = new URL(reqRes.body.previewUrl as string).searchParams.get('token');
    expect(rawToken).toBeTruthy();

    // Confirma que o banco guarda apenas o hash SHA-256 e nunca o token puro
    const expectedHash = createHash('sha256').update(rawToken!).digest('hex');
    const storedToken = await prisma.magicLinkToken.findUniqueOrThrow({ where: { tokenHash: expectedHash } });
    expect(storedToken.userId).toBe(user.id);
    expect(storedToken.usedAt).toBeNull();

    // Primeiro consumo autentica com JWT válido
    const verifyRes = await client
      .post('/auth/magic-link/verify')
      .send({ token: rawToken })
      .expect(200);
    expect(typeof verifyRes.body.token).toBe('string');
    expect(verifyRes.body.user).toMatchObject({ id: user.id, email, role: 'BUYER' });

    // Reutilização do mesmo token deve ser rejeitada (401)
    const replayRes = await client
      .post('/auth/magic-link/verify')
      .send({ token: rawToken })
      .expect(401);
    expect(replayRes.body.code).toBe('INVALID_MAGIC_LINK');

    // Token expirado no banco deve ser rejeitado (401)
    const expiredRaw = 'expired-' + randomUUID();
    const expiredHash = createHash('sha256').update(expiredRaw).digest('hex');
    await prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await client.post('/auth/magic-link/verify').send({ token: expiredRaw }).expect(401);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
  }
});

it('bloqueia Link Mágico simulado em produção sem SMTP/Resend e aceita estratégia injetada (DIP)', async () => {
  const email = `dip-${randomUUID()}@eventbook.test`;
  const captured: Array<{ email: string; magicUrl: string }> = [];

  const spyDelivery: MagicLinkDelivery = {
    mode: 'smtp',
    canDeliver: true,
    async send(payload) {
      captured.push({ email: payload.email, magicUrl: payload.magicUrl });
      return {};
    },
  };

  try {
    await prisma.user.create({
      data: {
        name: 'Organizador DIP',
        email,
        password: await bcrypt.hash('Segredo-123!', 10),
        role: 'ORGANIZER',
      },
    });

    // Produção sem SMTP/Resend recusa com 503 sem vazar link HTTP
    const prodWithoutEmail = createMagicLinkDelivery({
      NODE_ENV: 'production',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      EMAIL_FROM: 'ColaAí <no-reply@colaai.local>',
    });
    expect(prodWithoutEmail).toBeInstanceOf(SimulatedMagicLinkDelivery);
    expect(prodWithoutEmail.canDeliver).toBe(false);

    const strictService = new AuthService(prodWithoutEmail, 'https://colaai.example');
    await expect(strictService.requestMagicLink(email)).rejects.toMatchObject({
      code: 'MAGIC_LINK_UNAVAILABLE',
      statusCode: 503,
    });

    // Estratégia injetada envia o link construído com appBaseUrl e nunca devolve previewUrl
    const customService = new AuthService(spyDelivery, 'https://colaai.example');
    const result = await customService.requestMagicLink(email);
    expect(result.previewUrl).toBeUndefined();
    expect(captured).toHaveLength(1);
    expect(captured[0].magicUrl.startsWith('https://colaai.example/magic-link?token=')).toBe(true);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
  }
});
