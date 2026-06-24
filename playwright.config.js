import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E конфигурация.
 *
 * Запускает dev-сервер Nuxt автоматически (reuseExistingServer: true —
 * использует уже запущенный, если есть). Тесты работают с реальными
 * данными из public/assets/songs.json.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js$/,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: true,
  },
})
