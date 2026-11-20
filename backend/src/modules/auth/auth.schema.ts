import { Role } from '@prisma/client';
import { z } from 'zod';
import { createOptionalImageDataUrlSchema } from '../../shared/validation/imageDataUrl.js';

const avatarImageSchema = createOptionalImageDataUrlSchema({
  maxLength: 750_000,
  message: 'A foto de perfil deve ser PNG, JPEG ou WebP válida de até 500 KB.',
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().trim().email('E-mail inválido').toLowerCase(),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').toLowerCase(),
  password: z.string().min(1, 'A senha é obrigatória'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(100).optional(),
  email: z.string().trim().email('E-mail inválido').toLowerCase().optional(),
  phone: z.string().trim().max(30, 'O telefone deve ter no máximo 30 caracteres').nullable().optional(),
  city: z.string().trim().max(100, 'A cidade deve ter no máximo 100 caracteres').nullable().optional(),
  bio: z.string().trim().max(280, 'A bio deve ter no máximo 280 caracteres').nullable().optional(),
  avatarImage: avatarImageSchema,
}).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: 'Informe ao menos um campo para atualizar.' },
);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres').max(128),
});

export const requestMagicLinkSchema = z.object({
  email: z.string().trim().email('E-mail inválido').toLowerCase(),
});

export const verifyMagicLinkSchema = z.object({
  token: z.string().trim().min(32, 'Token mágico inválido').max(256),
});

export const adminListUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.nativeEnum(Role).optional(),
});

export const adminUserParamsSchema = z.object({
  id: z.guid().transform((value) => value.toLowerCase()),
});

export const adminUpdateUserRoleSchema = z.object({
  role: z.nativeEnum(Role),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkSchema>;
export type VerifyMagicLinkInput = z.infer<typeof verifyMagicLinkSchema>;
export type AdminListUsersQueryInput = z.infer<typeof adminListUsersQuerySchema>;
export type AdminUpdateUserRoleInput = z.infer<typeof adminUpdateUserRoleSchema>;
