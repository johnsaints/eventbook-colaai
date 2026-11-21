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

    await expect(page.locator('main').getByRole('status')).toContainText('enviaremos um link de acesso válido por 15 minutos')
    await page.getByRole('link', { name: 'Abrir link mágico de acesso' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.ca-toast')).toContainText('Sessão iniciada como Mariana E2E.')

    const nav = page.locator('.navbar .nav-links')
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toHaveCount(0)

    await page.locator('.navbar a[href="/perfil"]').click()
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

    await expect(page.locator('main').getByRole('status')).toHaveText('Cadastro e perfil atualizados com sucesso.')
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
    provisionedStaff: `e2e-provisioned-${tag}@eventbook.test`,
    admin: `e2e-admin-${tag}@eventbook.test`,
    target: `e2e-target-${tag}@eventbook.test`,
  }

  try {
    const now = Date.now()
    const [organizerUser] = await prisma.$transaction([
      prisma.user.create({ data: { name: 'Org RBAC', email: emails.organizer, password: passwordHash, role: 'ORGANIZER' } }),
      prisma.user.create({ data: { name: 'Staff RBAC', email: emails.staff, password: passwordHash, role: 'STAFF' } }),
      prisma.user.create({ data: { name: 'Admin RBAC', email: emails.admin, password: passwordHash, role: 'ADMIN' } }),
      prisma.user.create({ data: { name: 'Alvo RBAC', email: emails.target, password: passwordHash, role: 'BUYER' } }),
    ])

    const staffSampleEvent = await prisma.event.create({
      data: {
        organizerId: organizerUser.id,
        title: `Evento Portaria ReadOnly ${tag.slice(0, 6)}`,
        description: 'Evento publicado para validar bloqueio de compra pelo perfil STAFF.',
        location: 'Fortaleza, CE',
        capacity: 50,
        status: 'PUBLISHED',
        startsAt: new Date(now + 24 * 3_600_000),
        endsAt: new Date(now + 28 * 3_600_000),
        lots: {
          create: {
            name: 'Pista Staff',
            price: '45.00',
            totalQuantity: 50,
            salesStartsAt: new Date(now - 3_600_000),
            salesEndsAt: new Date(now + 24 * 3_600_000),
          },
        },
      },
      select: { id: true },
    })

    const nav = page.locator('.navbar .nav-links')

    const toLocalInputString = (ms) => {
      const date = new Date(ms)
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    }

    async function signIn(email, expectedPath, { rememberMe = false } = {}) {
      await page.goto('/login')
      await page.getByLabel('E-mail').fill(email)
      await page.getByLabel('Senha').fill(password)
      const rememberCheckbox = page.getByLabel(/Lembrar acesso neste dispositivo/i)
      if (rememberMe) {
        await rememberCheckbox.check()
      } else {
        await expect(rememberCheckbox).not.toBeChecked()
      }
      await page.getByRole('button', { name: 'Entrar', exact: true }).click()
      await expect(page).toHaveURL(expectedPath)
      await expect(page.locator('.ca-toast').filter({ hasText: 'Sessão iniciada como' })).toBeVisible()
    }

    async function signOutAndAssertHome() {
      await page.locator('.navbar').getByRole('button', { name: 'Sair' }).click()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.locator('.ca-toast').filter({ hasText: 'Logout realizado com sucesso.' })).toBeVisible()
      const tokens = await page.evaluate(() => ({
        session: sessionStorage.getItem('eventbook:token'),
        local: localStorage.getItem('eventbook:token'),
      }))
      expect(tokens.session).toBeNull()
      expect(tokens.local).toBeNull()
    }

    // ORGANIZER redireciona direto para /painel (sem "Lembrar acesso": somente sessionStorage)
    await signIn(emails.organizer, /\/painel$/)
    const organizerTokens = await page.evaluate(() => ({
      session: sessionStorage.getItem('eventbook:token'),
      local: localStorage.getItem('eventbook:token'),
    }))
    expect(organizerTokens.session).toBeTruthy()
    expect(organizerTokens.local).toBeNull()
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toHaveCount(0)
    await expect(page.locator('.dashboard-bento-grid')).toBeVisible()

    // Equipe padrão do organizador: cadastra conta STAFF direta sem depender de Admin
    await page.getByRole('button', { name: /Minha equipe/ }).click()
    const organizerDrawer = page.getByRole('dialog')
    await expect(organizerDrawer).toBeVisible()
    await expect(organizerDrawer.getByRole('heading', { name: 'Minha equipe padrão' })).toBeVisible()
    await organizerDrawer.getByRole('tab', { name: 'Cadastrar novo membro' }).click()
    await organizerDrawer.getByLabel('Nome completo').fill('Portaria Novo E2E')
    await organizerDrawer.getByLabel('E-mail').fill(emails.provisionedStaff)
    await organizerDrawer.getByRole('button', { name: 'Criar conta STAFF' }).click()
    const credentialsBox = organizerDrawer.getByRole('region', { name: 'Credenciais da nova conta STAFF' })
    await expect(credentialsBox).toBeVisible()
    await expect(credentialsBox).toContainText('ColaAi-')
    await expect(organizerDrawer.locator('.event-list').getByRole('heading', { name: 'Portaria Novo E2E' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(organizerDrawer).toHaveCount(0)

    await page.getByRole('button', { name: 'Novo evento' }).click()
    await expect(organizerDrawer).toBeVisible()
    await expect(organizerDrawer.getByRole('heading', { name: 'Novo evento' })).toBeVisible()

    // Valida bloqueio do scroll de fundo e enquadramento da gaveta na altura da viewport
    const drawerLayout = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const rect = dialog ? dialog.getBoundingClientRect() : null
      return {
        htmlOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
        fitsViewport: Boolean(rect && rect.top >= 0 && rect.bottom <= window.innerHeight + 1),
      }
    })
    expect(drawerLayout.htmlOverflow).toBe('hidden')
    expect(drawerLayout.bodyOverflow).toBe('hidden')
    expect(drawerLayout.fitsViewport).toBe(true)

    const createEventBtn = organizerDrawer.getByRole('button', { name: 'Criar evento' })
    await expect(createEventBtn).toHaveClass(/btn-primary/)

    const createdTitle = `Evento Painel E2E ${tag.slice(0, 6)}`
    await organizerDrawer.getByLabel('Título').fill(createdTitle)
    await organizerDrawer.getByLabel('Descrição').fill('Descrição completa para validar criação direta para lotes e gestão.')
    await organizerDrawer.getByLabel('Local').fill('Arena ColaAí, Fortaleza')
    await organizerDrawer.getByLabel('Capacidade').fill('120')
    await organizerDrawer.getByLabel('Início').fill(toLocalInputString(now + 48 * 3_600_000))
    await organizerDrawer.getByLabel('Término').fill(toLocalInputString(now + 52 * 3_600_000))
    await expect(organizerDrawer.getByLabel(/Vincular automaticamente minha equipe padrão \(1\)/)).toBeChecked()
    await createEventBtn.click()

    await expect(organizerDrawer.getByRole('tab', { name: 'Lotes' })).toHaveAttribute('aria-selected', 'true')
    await expect(organizerDrawer.getByRole('heading', { name: 'Novo lote' })).toBeVisible()
    const createLotBtn = organizerDrawer.getByRole('button', { name: 'Cadastrar lote' })
    const cancelLotBtn = organizerDrawer.getByRole('button', { name: 'Cancelar' })
    await expect(createLotBtn).toHaveClass(/btn-primary/)
    await expect(cancelLotBtn).toHaveClass(/btn-ghost/)

    await organizerDrawer.getByLabel('Nome do lote').fill('Lote Único E2E')
    await organizerDrawer.getByLabel('Preço (R$)').fill('50')
    await organizerDrawer.getByLabel('Quantidade de ingressos').fill('40')
    await organizerDrawer.getByLabel('Início das vendas').fill(toLocalInputString(now + 60_000))
    await organizerDrawer.getByLabel('Fim das vendas').fill(toLocalInputString(now + 47 * 3_600_000))
    await createLotBtn.click()
    await expect(organizerDrawer.getByRole('status').filter({ hasText: 'Lote cadastrado!' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(organizerDrawer).toHaveCount(0)

    const unlockedScroll = await page.evaluate(() => ({
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    }))
    expect(unlockedScroll.htmlOverflow).toBe('')
    expect(unlockedScroll.bodyOverflow).toBe('')

    const eventCard = page.locator('article.organizer-event-card')
      .filter({ has: page.getByRole('heading', { name: createdTitle, exact: true }) })
    await expect(eventCard.getByText('Equipe: 1')).toBeVisible()

    // Abre Gestão do Evento -> aba Equipe, confirma membro padrão automático e adiciona via autocomplete STAFF
    await eventCard.getByRole('button', { name: `Gestão do Evento ${createdTitle}` }).click()
    await expect(organizerDrawer).toBeVisible()
    await organizerDrawer.getByRole('tab', { name: 'Equipe' }).click()
    await expect(organizerDrawer.locator('.event-list').getByRole('heading', { name: 'Portaria Novo E2E' })).toBeVisible()
    await organizerDrawer.getByLabel('E-mail da conta STAFF').fill(emails.staff)
    const candidateRow = organizerDrawer.locator('.staff-candidate-row').filter({ hasText: 'Staff RBAC' })
    await expect(candidateRow).toBeVisible()
    await candidateRow.getByRole('button', { name: 'Adicionar' }).click()
    await expect(organizerDrawer.locator('.event-list').getByRole('heading', { name: 'Staff RBAC' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(organizerDrawer).toHaveCount(0)
    await expect(eventCard.getByText('Equipe: 2')).toBeVisible()
    await expect(eventCard.getByRole('button', { name: `Gestão do Evento ${createdTitle}` })).toBeVisible()
    await expect(eventCard.getByRole('button', { name: `Editar ${createdTitle}` })).toHaveCount(0)
    await expect(eventCard.getByRole('button', { name: `Equipe de ${createdTitle}` })).toHaveCount(0)

    await eventCard.getByRole('button', { name: `Publicar ${createdTitle}` }).click()
    await expect(eventCard.getByText('Publicado', { exact: true })).toBeVisible()

    const featureBtn = eventCard.getByRole('button', { name: `Destacar ${createdTitle}` })
    await expect(featureBtn).toBeVisible()
    await featureBtn.click()
    const unfeatureBtn = eventCard.getByRole('button', { name: `Remover destaque de ${createdTitle}` })
    await expect(unfeatureBtn).toHaveAttribute('aria-pressed', 'true')

    const hideBtn = eventCard.getByRole('button', { name: `Ocultar ${createdTitle}` })
    await expect(hideBtn).toBeVisible()
    await hideBtn.click()
    await expect(eventCard.getByText('Rascunho', { exact: true })).toBeVisible()

    await eventCard.getByRole('button', { name: `Excluir ${createdTitle}` }).click()
    await eventCard.getByRole('button', { name: 'Confirmar exclusão' }).click()
    await expect(eventCard).toHaveCount(0)

    await signOutAndAssertHome()

    // STAFF redireciona direto para /check-in, não vê Eventos e fica em modo somente leitura na página de evento
    await signIn(emails.staff, /\/check-in$/)
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toHaveCount(0)

    await page.goto(`/events/${staffSampleEvent.id}`)
    await expect(page.getByRole('alert')).toContainText('A reserva e compra de ingressos está disponível apenas para contas de Comprador')
    await expect(page.getByRole('button', { name: 'Adicionar ingresso de Pista Staff' })).toBeDisabled()
    await signOutAndAssertHome()

    // ADMIN entra com "Lembrar acesso" marcado -> persiste em localStorage e mantém login em nova aba
    await signIn(emails.admin, /\/painel$/, { rememberMe: true })
    const adminTokens = await page.evaluate(() => ({
      session: sessionStorage.getItem('eventbook:token'),
      local: localStorage.getItem('eventbook:token'),
    }))
    expect(adminTokens.local).toBeTruthy()
    expect(adminTokens.session).toBeNull()

    const secondTab = await page.context().newPage()
    await secondTab.goto('/painel')
    await expect(secondTab.locator('.navbar').getByRole('link', { name: 'Admin RBAC' })).toBeVisible()
    await secondTab.close()

    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Meus Ingressos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Painel', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Check-in', exact: true })).toBeVisible()

    await page.locator('.navbar a[href="/perfil"]').click()
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

    await expect(adminDrawer.getByRole('status').filter({ hasText: 'Perfil de Alvo RBAC atualizado para Organizador.' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(adminDrawer).toHaveCount(0)
    const updatedTarget = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } })
    expect(updatedTarget.role).toBe('ORGANIZER')
    await signOutAndAssertHome()
  } finally {
    await prisma.event.deleteMany({ where: { organizer: { email: emails.organizer } } })
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
    await prisma.$disconnect()
  }
})

test('layout responsivo (mobile, tablet, desktop e ultrawide) sem overflow horizontal', async ({ page }) => {
  const prisma = new PrismaClient({ datasourceUrl: getE2EDatabaseUrl() })
  const tag = randomUUID()
  const email = `e2e-mobile-${tag}@eventbook.test`
  const buyerEmail = `e2e-mobile-buyer-${tag}@eventbook.test`

  try {
    const mobilePassword = 'EventBook-Mobile-123!'
    const passwordHash = await bcrypt.hash(mobilePassword, 10)
    const now = Date.now()
    const [organizer, buyer] = await prisma.$transaction([
      prisma.user.create({
        data: { name: 'Produtor Mobile', email, password: passwordHash, role: 'ORGANIZER' },
      }),
      prisma.user.create({
        data: { name: 'Comprador Mobile', email: buyerEmail, password: passwordHash, role: 'BUYER' },
      }),
    ])

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
          select: { id: true, lots: { select: { id: true }, take: 1 } },
        }),
      ),
    )

    const firstEventId = createdEvents[0].id
    const firstLotId = createdEvents[0].lots[0].id
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        eventId: firstEventId,
        totalAmount: '80.00',
        status: 'PAID',
        expiresAt: new Date(now + 900_000),
        paidAt: new Date(now),
        items: { create: { lotId: firstLotId, quantity: 1, unitPriceSnapshot: '80.00' } },
      },
      select: { id: true },
    })

    await prisma.ticket.create({
      data: {
        code: `CA-RESP-${tag.slice(0, 8).toUpperCase()}`,
        orderId: order.id,
        eventId: firstEventId,
        lotId: firstLotId,
        status: 'VALID',
      },
    })

    await page.goto('/login')
    await page.getByLabel('E-mail').fill(buyerEmail)
    await page.getByLabel('Senha').fill(mobilePassword)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.ca-toast')).toContainText('Sessão iniciada como')

    const viewports = [
      { name: 'mobile', width: 360, height: 800, expectsDrawer: true, verticalTicket: true },
      { name: 'tablet', width: 768, height: 1024, expectsDrawer: true, verticalTicket: false },
      { name: 'desktop', width: 1280, height: 720, expectsDrawer: false, verticalTicket: false },
      { name: 'large', width: 1920, height: 1080, expectsDrawer: false, verticalTicket: false },
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
      await expect(page.locator('.sympla-visual-seal')).toHaveCount(0)
      const heroBox = await page.locator('.sympla-hero').boundingBox()
      const topBarBox = await page.locator('.sympla-top-bar').boundingBox()
      expect(heroBox).not.toBeNull()
      expect(topBarBox).not.toBeNull()
      expect(heroBox.y).toBeLessThan(topBarBox.y)
      await expect(page.locator('.sympla-top-bar .hero-ambient-video')).toBeAttached()
      const videoToggle = page.locator('.sympla-top-bar .hero-video-toggle')
      await expect(videoToggle).toHaveAttribute('aria-label', 'Pausar vídeo de fundo')
      await videoToggle.click()
      await expect(videoToggle).toHaveAttribute('aria-label', 'Reproduzir vídeo de fundo')
      await videoToggle.click()
      await expect(videoToggle).toHaveAttribute('aria-label', 'Pausar vídeo de fundo')
      await assertBoxFitsViewport('.sympla-top-bar')
      await assertBoxFitsViewport('.sympla-hero-viewport')
      await assertBoxFitsViewport('.sympla-cat-strip')
      await assertBoxFitsViewport('.catalog-sort-control')
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

      await page.goto('/meus-ingressos')
      await expect(page.locator('.colaai-ticket').first()).toBeVisible()
      await assertBoxFitsViewport('.colaai-ticket')
      const brandBox = await page.locator('.colaai-ticket-brand').first().boundingBox()
      const stubBox = await page.locator('.colaai-ticket-stub').first().boundingBox()
      const mainBox = await page.locator('.colaai-ticket-main').first().boundingBox()
      expect(brandBox).not.toBeNull()
      expect(stubBox).not.toBeNull()
      expect(mainBox).not.toBeNull()
      if (vp.verticalTicket) {
        expect(mainBox.y).toBeGreaterThan(brandBox.y + brandBox.height * 0.4)
        expect(stubBox.y).toBeGreaterThan(mainBox.y + mainBox.height * 0.5)
      } else {
        expect(stubBox.x).toBeGreaterThan(mainBox.x)
      }
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
    await prisma.ticket.deleteMany({ where: { order: { buyer: { email: buyerEmail } } } })
    await prisma.order.deleteMany({ where: { buyer: { email: buyerEmail } } })
    await prisma.event.deleteMany({ where: { organizer: { email } } })
    await prisma.user.deleteMany({ where: { email: { in: [email, buyerEmail] } } })
    await prisma.$disconnect()
  }
})
