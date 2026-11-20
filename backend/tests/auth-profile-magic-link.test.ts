import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

it('aplica permissões RBAC de ADMIN em fluxos de teste e gerencia perfis via /admin/users', async () => {
  const client = request(app);
  const passwordHash = await bcrypt.hash('SenhaRbac-2026!', 10);
  const tag = randomUUID();

  const [adminUser, organizerUser, staffUser, buyerUser] = await prisma.$transaction([
    prisma.user.create({
      data: { name: 'Admin RBAC', email: `rbac-admin-${tag}@eventbook.test`, password: passwordHash, role: 'ADMIN' },
    }),
    prisma.user.create({
      data: { name: 'Organizador RBAC', email: `rbac-org-${tag}@eventbook.test`, password: passwordHash, role: 'ORGANIZER' },
    }),
    prisma.user.create({
      data: { name: 'Staff RBAC', email: `rbac-staff-${tag}@eventbook.test`, password: passwordHash, role: 'STAFF' },
    }),
    prisma.user.create({
      data: { name: 'Comprador RBAC', email: `rbac-buyer-${tag}@eventbook.test`, password: passwordHash, role: 'BUYER' },
    }),
  ]);

  const adminAuth = `Bearer ${jwt.sign({ role: adminUser.role }, env.JWT_SECRET, { subject: adminUser.id })}`;
  const orgAuth = `Bearer ${jwt.sign({ role: organizerUser.role }, env.JWT_SECRET, { subject: organizerUser.id })}`;
  const staffAuth = `Bearer ${jwt.sign({ role: staffUser.role }, env.JWT_SECRET, { subject: staffUser.id })}`;
  const buyerAuth = `Bearer ${jwt.sign({ role: buyerUser.role }, env.JWT_SECRET, { subject: buyerUser.id })}`;

  try {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 60_000);
    const endsAt = new Date(now + 120 * 60_000);

    const event = await prisma.event.create({
      data: {
        organizerId: organizerUser.id,
        title: `Evento RBAC ${tag.slice(0, 8)}`,
        description: 'Teste completo de permissões por perfil.',
        location: 'Fortaleza, CE',
        capacity: 50,
        status: 'PUBLISHED',
        startsAt,
        endsAt,
        lots: {
          create: {
            name: 'Lote Único RBAC',
            price: '30.00',
            totalQuantity: 10,
            salesStartsAt: new Date(now - 60_000),
            salesEndsAt: startsAt,
          },
        },
      },
      include: { lots: true },
    });
    const lotId = event.lots[0].id;

    // STAFF não pode reservar ou consultar ingressos de comprador
    await client.post('/orders').set('Authorization', staffAuth).send({
      eventId: event.id,
      items: [{ lotId, quantity: 1 }],
    }).expect(403);
    await client.get('/tickets/me').set('Authorization', staffAuth).expect(403);

    // ADMIN pode testar criação de pedido, checkout, Meus Ingressos, Painel e Check-in
    const orderRes = await client.post('/orders').set('Authorization', adminAuth).send({
      eventId: event.id,
      items: [{ lotId, quantity: 1 }],
    }).expect(201);
    await client.post(`/orders/${orderRes.body.id}/checkout`).set('Authorization', adminAuth).expect(200);

    const adminOrders = await client.get('/orders/me').set('Authorization', adminAuth).expect(200);
    expect(adminOrders.body.data.some((o: { id: string }) => o.id === orderRes.body.id)).toBe(true);

    const adminTickets = await client.get('/tickets/me').set('Authorization', adminAuth).expect(200);
    expect(adminTickets.body.data).toHaveLength(1);
    const ticketCode: string = adminTickets.body.data[0].code;

    const adminEvents = await client.get('/events/mine').set('Authorization', adminAuth).expect(200);
    expect(adminEvents.body.data.some((e: { id: string }) => e.id === event.id)).toBe(true);

    const staffEventsAsAdmin = await client.get('/staff/events').set('Authorization', adminAuth).expect(200);
    expect(staffEventsAsAdmin.body.some((e: { id: string }) => e.id === event.id)).toBe(true);

    const checkinAsAdmin = await client
      .post(`/tickets/${encodeURIComponent(ticketCode)}/checkin`)
      .set('Authorization', adminAuth)
      .send({ eventId: event.id })
      .expect(201);
    expect(checkinAsAdmin.body.status).toBe('USED');

    // Somente ADMIN lista e altera perfis em /admin/users
    await client.get('/admin/users').expect(401);
    for (const nonAdmin of [buyerAuth, orgAuth, staffAuth]) {
      await client.get('/admin/users').set('Authorization', nonAdmin).expect(403);
      await client.patch(`/admin/users/${buyerUser.id}/role`)
        .set('Authorization', nonAdmin)
        .send({ role: 'ORGANIZER' })
        .expect(403);
    }

    const filteredUsers = await client
      .get('/admin/users')
      .query({ q: buyerUser.email, role: 'BUYER' })
      .set('Authorization', adminAuth)
      .expect(200);
    expect(filteredUsers.body.data.map((u: { id: string }) => u.id)).toEqual([buyerUser.id]);

    const promoted = await client
      .patch(`/admin/users/${buyerUser.id}/role`)
      .set('Authorization', adminAuth)
      .send({ role: 'ORGANIZER' })
      .expect(200);
    expect(promoted.body).toMatchObject({ id: buyerUser.id, role: 'ORGANIZER' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyerUser.id } })).role).toBe('ORGANIZER');

    await client
      .patch(`/admin/users/${buyerUser.id}/role`)
      .set('Authorization', adminAuth)
      .send({ role: 'STAFF' })
      .expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyerUser.id } })).role).toBe('STAFF');

    const missing = await client
      .patch(`/admin/users/${randomUUID()}/role`)
      .set('Authorization', adminAuth)
      .send({ role: 'STAFF' })
      .expect(404);
    expect(missing.body.code).toBe('USER_NOT_FOUND');

    const selfDemote = await client
      .patch(`/admin/users/${adminUser.id}/role`)
      .set('Authorization', adminAuth)
      .send({ role: 'BUYER' })
      .expect(422);
    expect(selfDemote.body.code).toBe('SELF_ROLE_CHANGE_FORBIDDEN');
  } finally {
    await prisma.$transaction([
      prisma.checkIn.deleteMany({ where: { staffId: { in: [adminUser.id, staffUser.id] } } }),
      prisma.order.deleteMany({ where: { buyerId: { in: [adminUser.id, buyerUser.id] } } }),
      prisma.event.deleteMany({ where: { organizerId: organizerUser.id } }),
      prisma.user.deleteMany({
        where: { id: { in: [adminUser.id, organizerUser.id, staffUser.id, buyerUser.id] } },
      }),
    ]);
  }
});
