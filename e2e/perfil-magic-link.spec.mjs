import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { apiUrl, getE2EDatabaseUrl } from './environment.mjs'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const { PrismaClient } = require('@prisma/client')

const SAMPLE_AVATAR_PATH = fileURLToPath(new URL('../frontend/public/favicon-32x32.png', import.meta.url))

test('login por Link Mágico e edição completa de perfil com foto', async ({ page, request }) => {
  const prisma = new PrismaClient({ datasourceUrl: getE2EDatabaseUrl() })
  const email = `perfil-magic-${randomUUID()}@eventbook.test`
  const password = 'EventBook-Magic-123!'

  try {
    const reg = await request.post(apiUrl + '/register', {
      data: { name: 'Mariana E2E', email, password },
    })
    expect(reg.status()).toBe(201)

    await page.goto('/login')
    await page.getByRole('tab', { name: 'Link mágico' }).click()
    await page.getByLabel('E-mail cadastrado').fill(email)
    await page.getByRole('button', { name: 'Enviar link mágico' }).click()

    await expect(page.getByRole('status')).toContainText('enviaremos um link de acesso válido por 15 minutos')
    await page.getByRole('link', { name: 'Abrir link mágico de acesso' }).click()

    await expect(page).toHaveURL(/\/magic-link\?token=/)
    await expect(page.getByRole('status')).toHaveText('Sessão iniciada como Mariana E2E.')

    await page.getByRole('link', { name: 'Meu Perfil' }).first().click()
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(page.getByRole('heading', { name: 'Meu Perfil' })).toBeVisible()

    // Upload da foto e edição completa do cadastro
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_AVATAR_PATH)
    await expect(page.locator('.profile-avatar-photo')).toBeVisible()

    await page.getByLabel('Nome completo').fill('Mariana Atualizada')
    await page.getByLabel('Telefone / WhatsApp').fill('(85) 99123-4567')
    await page.getByLabel('Cidade / UF').fill('Fortaleza, CE')
    await page.getByLabel('Sobre você').fill('Participando de shows e eventos de tecnologia.')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()

    await expect(page.getByRole('status')).toHaveText('Cadastro e perfil atualizados com sucesso.')
    await expect(page.locator('.navbar').getByRole('link', { name: 'Mariana Atualizada' })).toBeVisible()

    // Recarrega a página para confirmar persistência em banco e atualização imediata no header
    await page.reload()
    await expect(page.getByLabel('Nome completo')).toHaveValue('Mariana Atualizada')
    await expect(page.getByLabel('Telefone / WhatsApp')).toHaveValue('(85) 99123-4567')
    await expect(page.getByLabel('Cidade / UF')).toHaveValue('Fortaleza, CE')
    await expect(page.locator('.profile-avatar-photo')).toBeVisible()
    await expect(page.locator('.navbar .user-avatar-img')).toBeVisible()
  } finally {
    await prisma.user.deleteMany({ where: { email } })
    await prisma.$disconnect()
  }
})
