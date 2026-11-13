import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { apiUrl, frontendUrl, getE2EDatabaseUrl } from './environment.mjs'

const databaseUrl = getE2EDatabaseUrl()
const apiPort = new URL(apiUrl).port
const frontendPort = new URL(frontendUrl).port

export default defineConfig({
  testDir: '.',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  timeout: 45_000,
  use: {
    browserName: 'chromium',
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'API E2E',
      cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
      command: 'npm exec --no -- prisma migrate deploy && node --import tsx src/server.ts',
      url: apiUrl + '/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: apiPort,
        DATABASE_URL: databaseUrl,
        JWT_SECRET: randomBytes(32).toString('hex'),
        CORS_ORIGINS: frontendUrl,
      },
    },
    {
      name: 'Frontend E2E',
      cwd: fileURLToPath(new URL('../frontend/', import.meta.url)),
      command: 'npm run dev -- --host 127.0.0.1 --port ' + frontendPort + ' --strictPort',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: apiUrl },
    },
  ],
})
