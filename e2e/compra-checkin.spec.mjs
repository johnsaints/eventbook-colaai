import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test as base } from '@playwright/test'
import { apiUrl, frontendUrl, getE2EDatabaseUrl } from './environment.mjs'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const test = base.extend({
  scenario: async ({}, use) => {
    const prisma = new PrismaClient({ datasourceUrl: getE2EDatabaseUrl() })
    const id = randomUUID()
    const buyerEmail = 'comprador-' + id + '@eventbook.test'
    const staffEmail = 'staff-' + id + '@eventbook.test'
    const password = 'EventBook-E2E-123!'
    const lotName = 'Lote E2E'

    try {
      const hash = await bcrypt.hash(password, 10)
      const [owner, staff] = await prisma.$transaction([
        prisma.user.create({
          data: { name: 'Organizador E2E', email: 'organizador-' + id + '@eventbook.test', password: hash, role: 'ORGANIZER' },
        }),
        prisma.user.create({
          data: { name: 'Staff E2E', email: staffEmail, password: hash, role: 'STAFF' },
        }),
      ])

      try {
        const now = Date.now()
        const startsAt = new Date(now + 60 * 60_000)
        const event = await prisma.event.create({
          data: {
            organizerId: owner.id,
            title: 'Festival E2E ' + id.slice(0, 8),
            description: 'Evento sintético para compra e check-in.',
            location: 'Fortaleza, CE',
            capacity: 5,
            status: 'PUBLISHED',
            startsAt,
            endsAt: new Date(now + 3 * 60 * 60_000),
            lots: {
              create: {
                name: lotName, price: '25.00', totalQuantity: 5,
                salesStartsAt: new Date(now - 60 * 60_000), salesEndsAt: startsAt,
              },
            },
            staff: { create: { userId: staff.id } },
          },
          select: { id: true, title: true },
        })
        await use({ event, lotName, buyerEmail, staffEmail, password })
      } finally {
        await prisma.$transaction([
          prisma.checkIn.deleteMany({ where: { staffId: staff.id } }),
          prisma.order.deleteMany({ where: { buyer: { email: buyerEmail } } }),
          prisma.event.deleteMany({ where: { organizerId: owner.id } }),
          prisma.user.deleteMany({ where: { email: { in: [owner.email, staffEmail, buyerEmail] } } }),
        ])
      }
    } finally {
      await prisma.$disconnect()
    }
  },
})

async function signIn(page, email, password) {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

test('cadastro, compra e check-in do mesmo ingresso', async ({ browser, page, request, scenario }) => {
  const { event, lotName, buyerEmail, staffEmail, password } = scenario
  const eventPath = '/events/' + event.id

  await test.step('Cadastrar a conta de comprador pela API', async () => {
    const response = await request.post(apiUrl + '/register', {
      data: { name: 'Comprador E2E', email: buyerEmail, password },
    })
    expect(response.status()).toBe(201)
    expect(await response.json()).toMatchObject({ email: buyerEmail, role: 'BUYER' })
  })

  const ticket = page.getByRole('region', { name: 'Ingressos', exact: true })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: event.title, exact: true }) })

  const code = await test.step('Reservar, pagar e consultar o ingresso no navegador', async () => {
    await page.goto(eventPath)
    await page.getByRole('button', { name: 'Adicionar ingresso de ' + lotName }).click()
    await page.getByRole('link', { name: 'Entrar para reservar' }).click()
    await signIn(page, buyerEmail, password)

    await expect(page).toHaveURL(frontendUrl + eventPath)
    await expect(page.getByLabel('Quantidade de ' + lotName)).toHaveText('1')
    await page.getByRole('button', { name: 'Reservar ingressos' }).click()
    await expect(page.getByRole('status')).toHaveText('Ingressos reservados.')
    await page.getByRole('button', { name: 'Simular pagamento' }).click()
    await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible()
    await expect(page.getByText('1 ingresso emitido.', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Ver meus ingressos' }).click()
    await expect(ticket.getByText('Válido', { exact: true })).toBeVisible()
    const codeField = ticket.locator('code')
    await expect(codeField).toHaveText(/\S+/)
    const codeValue = await codeField.innerText()

    const expandButton = ticket.getByRole('button', { name: /Apresentar QR/ })
    const stubBox = await ticket.locator('.colaai-ticket-stub').boundingBox()
    const expandBox = await expandButton.boundingBox()
    const iconBox = await expandButton.locator('svg').boundingBox()
    expect(stubBox).not.toBeNull()
    expect(expandBox).not.toBeNull()
    expect(iconBox).not.toBeNull()
    expect(expandBox.height).toBeLessThanOrEqual(34)
    expect(expandBox.x).toBeGreaterThanOrEqual(stubBox.x)
    expect(expandBox.x + expandBox.width).toBeLessThanOrEqual(stubBox.x + stubBox.width + 0.5)
    expect(Math.abs((iconBox.y + iconBox.height / 2) - (expandBox.y + expandBox.height / 2))).toBeLessThanOrEqual(2.5)

    await expandButton.click()
    const qrDrawer = page.getByRole('dialog')
    await expect(qrDrawer).toBeVisible()
    await expect(qrDrawer).toContainText(codeValue)
    await page.keyboard.press('Escape')
    await expect(qrDrawer).toHaveCount(0)

    return codeValue
  })

  await test.step('Fazer o check-in com a conta STAFF e bloquear duplicidade', async () => {
    const context = await browser.newContext({ baseURL: frontendUrl })
    try {
      const staffPage = await context.newPage()
      await staffPage.goto('/login')
      await signIn(staffPage, staffEmail, password)
      await staffPage.getByRole('link', { name: 'Abrir check-in' }).click()
      await expect(staffPage.getByRole('combobox', { name: 'Evento', exact: true })).toHaveValue(event.id)

      const input = staffPage.getByRole('textbox', { name: 'Código do ingresso' })
      await expect(input).toBeFocused()
      await input.fill(code)
      await input.press('Enter')
      await expect(staffPage.getByRole('status')).toContainText('Check-in aprovado')

      await input.fill(code)
      await input.press('Enter')
      await expect(staffPage.getByRole('alert')).toContainText('Ingresso já utilizado')
    } finally {
      await context.close()
    }
  })

  await test.step('Conferir o mesmo ingresso como utilizado na conta de comprador', async () => {
    await page.reload()
    await expect(ticket.locator('code')).toHaveText(code)
    await expect(ticket.getByText('Utilizado', { exact: true })).toBeVisible()
  })
})
