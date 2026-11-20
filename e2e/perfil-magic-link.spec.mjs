import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { apiUrl, getE2EDatabaseUrl } from './environment.mjs'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

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

    const nav = page.locator('.navbar .nav-links')
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toHaveCount(0)

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

test('navegação contextual por perfil (ORGANIZER, STAFF, ADMIN) e gestão de contas pelo Admin', async ({ page }) => {
  const prisma = new PrismaClient({ datasourceUrl: getE2EDatabaseUrl() })
  const tag = randomUUID()
  const password = 'EventBook-RBAC-123!'
  const passwordHash = await bcrypt.hash(password, 10)
  const emails = {
    organizer: `e2e-org-${tag}@eventbook.test`,
    staff: `e2e-staff-${tag}@eventbook.test`,
    admin: `e2e-admin-${tag}@eventbook.test`,
    target: `e2e-target-${tag}@eventbook.test`,
  }

  try {
    await prisma.$transaction([
      prisma.user.create({ data: { name: 'Org RBAC', email: emails.organizer, password: passwordHash, role: 'ORGANIZER' } }),
      prisma.user.create({ data: { name: 'Staff RBAC', email: emails.staff, password: passwordHash, role: 'STAFF' } }),
      prisma.user.create({ data: { name: 'Admin RBAC', email: emails.admin, password: passwordHash, role: 'ADMIN' } }),
      prisma.user.create({ data: { name: 'Alvo RBAC', email: emails.target, password: passwordHash, role: 'BUYER' } }),
    ])

    const nav = page.locator('.navbar .nav-links')

    async function signIn(email) {
      await page.goto('/login')
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Senha').fill(password)
      await page.getByRole('button', { name: 'Entrar', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('Sessão iniciada como')
    }

    // ORGANIZER vê Eventos e Painel; abre Novo evento no Drawer e fecha com Escape
    await signIn(emails.organizer)
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toHaveCount(0)
    await nav.getByRole('link', { name: 'Painel', exact: true }).click()
    await page.getByRole('button', { name: 'Novo evento' }).click()
    const organizerDrawer = page.getByRole('dialog')
    await expect(organizerDrawer).toBeVisible()
    await expect(organizerDrawer.getByRole('heading', { name: 'Novo evento' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(organizerDrawer).toHaveCount(0)
    await page.locator('.navbar').getByRole('button', { name: 'Sair' }).click()

    // STAFF vê Eventos e Check-in; não vê Meus Ingressos nem Painel
    await signIn(emails.staff)
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toHaveCount(0)
    await page.locator('.navbar').getByRole('button', { name: 'Sair' }).click()

    // ADMIN vê todas as 4 abas e altera perfil de usuário em /perfil
    await signIn(emails.admin)
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Meu Perfil' }).first().click()
    await page.getByRole('button', { name: 'Gerenciar contas e permissões' }).click()
    const adminDrawer = page.getByRole('dialog')
    await expect(adminDrawer).toBeVisible()
    await expect(adminDrawer.getByRole('heading', { name: 'Gestão de Contas e Permissões' })).toBeVisible()
    await adminDrawer.getByLabel('Buscar por nome ou e-mail').fill(emails.target)
    await adminDrawer.getByRole('button', { name: 'Buscar', exact: true }).click()

    const roleSelect = adminDrawer.getByLabel(`Perfil de ${emails.target}`)
    await expect(roleSelect).toHaveValue('BUYER')
    await roleSelect.selectOption('ORGANIZER')
    await adminDrawer.getByRole('button', { name: 'Salvar perfil', exact: true }).click()

    await expect(adminDrawer.getByRole('status')).toContainText('Perfil de Alvo RBAC atualizado para Organizador.')
    await page.keyboard.press('Escape')
    await expect(adminDrawer).toHaveCount(0)
    const updatedTarget = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } })
    expect(updatedTarget.role).toBe('ORGANIZER')
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
    await prisma.$disconnect()
  }
})

test('layout responsivo (mobile, tablet, desktop e ultrawide) sem overflow horizontal', async ({ page }) => {
  const prisma = new PrismaClient({ datasourceUrl: getE2EDatabaseUrl() })
  const tag = randomUUID()
  const email = `e2e-mobile-${tag}@eventbook.test`

  try {
    const passwordHash = await bcrypt.hash('EventBook-Mobile-123!', 10)
    const now = Date.now()
    const organizer = await prisma.user.create({
      data: { name: 'Produtor Mobile', email, password: passwordHash, role: 'ORGANIZER' },
    })

    const createdEvents = await Promise.all(
      [1, 2].map((index) =>
        prisma.event.create({
          data: {
            organizerId: organizer.id,
            title: `Clássico das Multidões — Campeonato Estadual ${index} ${tag.slice(0, 6)}`,
            description: 'Evento de demonstração com título longo para validar o layout responsivo em telas pequenas.',
            location: 'Estádio Plácido Castelo · Fortaleza, CE',
            capacity: 50,
            status: 'PUBLISHED',
            startsAt: new Date(now + (index + 1) * 3_600_000),
            endsAt: new Date(now + (index + 4) * 3_600_000),
            lots: {
              create: {
                name: 'Arquibancada Central Inteira',
                price: '80.00',
                totalQuantity: 50,
                salesStartsAt: new Date(now - 3_600_000),
                salesEndsAt: new Date(now + (index + 1) * 3_600_000),
              },
            },
          },
          select: { id: true },
        }),
      ),
    )

    const firstEventId = createdEvents[0].id
    const viewports = [
      { name: 'mobile', width: 360, height: 800, expectsDrawer: true },
      { name: 'tablet', width: 768, height: 1024, expectsDrawer: true },
      { name: 'desktop', width: 1280, height: 720, expectsDrawer: false },
      { name: 'large', width: 1920, height: 1080, expectsDrawer: false },
    ]

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      async function assertBoxFitsViewport(selector) {
        const box = await page.locator(selector).first().boundingBox()
        expect(box).not.toBeNull()
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5)
      }

      async function assertNoHorizontalOverflow() {
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }))
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
      }

      await page.goto('/')
      await expect(page.locator('.sympla-hero-viewport')).toBeVisible()
      await expect(page.locator('.sympla-cat-strip')).toBeVisible()
      await assertBoxFitsViewport('.sympla-top-bar')
      await assertBoxFitsViewport('.sympla-hero-viewport')
      await assertBoxFitsViewport('.sympla-cat-strip')
      await assertBoxFitsViewport('.event-list')
      await assertNoHorizontalOverflow()

      if (vp.expectsDrawer) {
        await expect(page.locator('.navbar .nav-links')).not.toBeVisible()
        await expect(page.getByRole('button', { name: 'Abrir menu de navegação' })).toBeVisible()
      } else {
        await expect(page.locator('.navbar .nav-links')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Abrir menu de navegação' })).not.toBeVisible()
      }

      await page.goto(`/events/${firstEventId}`)
      await expect(page.getByRole('heading', { name: 'Lotes à venda' })).toBeVisible()
      await assertBoxFitsViewport('.event-detail-hero')
      await assertBoxFitsViewport('.lot-row-card')
      await assertNoHorizontalOverflow()

      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Entrar no ColaAí' })).toBeVisible()
      await assertBoxFitsViewport('.auth-card')
      await assertNoHorizontalOverflow()
    }

    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Abrir menu de navegação' }).click()

    const mobileDrawer = page.getByRole('dialog')
    await expect(mobileDrawer).toBeVisible()
    await expect(mobileDrawer.getByRole('heading', { name: 'Menu' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(mobileDrawer).toHaveCount(0)
  } finally {
    await prisma.event.deleteMany({ where: { organizer: { email } } })
    await prisma.user.deleteMany({ where: { email } })
    await prisma.$disconnect()
  }
})
