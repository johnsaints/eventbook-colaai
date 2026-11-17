import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from './auth.schema.js';
import { createMagicLinkDelivery, MagicLinkDelivery } from './magicLink.delivery.js';

const USER_PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  city: true,
  bio: true,
  avatarImage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarImage: string | null;
};

const MAGIC_LINK_TTL_MS = 15 * 60_000;
const MAGIC_LINK_GENERIC_MESSAGE =
  'Se existir uma conta associada a este e-mail, enviaremos um link de acesso válido por 15 minutos.';

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashMagicToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export class AuthService {
  constructor(
    private readonly magicLinkDelivery: MagicLinkDelivery = createMagicLinkDelivery(env),
    private readonly appBaseUrl: string = env.APP_URL,
  ) {}

  private issueSession(user: SessionUser) {
    const token = jwt.sign({ role: user.role }, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: '1d',
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarImage: user.avatarImage,
      },
    };
  }

  async register(data: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'Este e-mail já está cadastrado', 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Todo cadastro público recebe o perfil BUYER
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: Role.BUYER,
      },
      select: USER_PROFILE_SELECT,
    });

    return user;
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 401);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 401);
    }

    return this.issueSession(user);
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
    }

    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!existingUser) {
      throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
    }

    if (data.email && data.email !== existingUser.email) {
      const emailOwner = await prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (emailOwner && emailOwner.id !== userId) {
        throw new AppError('EMAIL_ALREADY_EXISTS', 'Este e-mail já está em uso por outra conta', 409);
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: normalizeOptionalText(data.phone) } : {}),
      ...(data.city !== undefined ? { city: normalizeOptionalText(data.city) } : {}),
      ...(data.bio !== undefined ? { bio: normalizeOptionalText(data.bio) } : {}),
      ...(data.avatarImage !== undefined ? { avatarImage: data.avatarImage } : {}),
    };

    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_PROFILE_SELECT,
    });
  }

  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
    }

    const matchesCurrent = await bcrypt.compare(data.currentPassword, user.password);
    if (!matchesCurrent) {
      throw new AppError('INVALID_CREDENTIALS', 'A senha atual informada está incorreta', 401);
    }

    const newHash = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    });

    return { message: 'Senha atualizada com sucesso.' };
  }

  async requestMagicLink(email: string) {
    if (!this.magicLinkDelivery.canDeliver) {
      throw new AppError(
        'MAGIC_LINK_UNAVAILABLE',
        'O envio de link mágico por e-mail não está configurado neste ambiente.',
        503,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return { message: MAGIC_LINK_GENERIC_MESSAGE };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashMagicToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);

    await prisma.$transaction([
      prisma.magicLinkToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.magicLinkToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const magicUrl = new URL('/magic-link', this.appBaseUrl);
    magicUrl.searchParams.set('token', rawToken);

    const delivery = await this.magicLinkDelivery.send({
      email: user.email,
      name: user.name,
      magicUrl: magicUrl.toString(),
      expiresAt,
    });

    return {
      message: MAGIC_LINK_GENERIC_MESSAGE,
      ...(delivery.previewUrl ? { previewUrl: delivery.previewUrl } : {}),
    };
  }

  async verifyMagicLink(rawToken: string) {
    const tokenHash = hashMagicToken(rawToken);
    const now = new Date();

    const record = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarImage: true,
          },
        },
      },
    });

    if (!record || record.usedAt !== null || record.expiresAt <= now) {
      throw new AppError('INVALID_MAGIC_LINK', 'Link mágico inválido ou expirado. Solicite um novo link.', 401);
    }

    // Consumo atômico de uso único para impedir reaproveitamento concorrente
    const claimed = await prisma.magicLinkToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (claimed.count !== 1) {
      throw new AppError('INVALID_MAGIC_LINK', 'Link mágico inválido ou já utilizado. Solicite um novo link.', 401);
    }

    return this.issueSession(record.user);
  }
}
