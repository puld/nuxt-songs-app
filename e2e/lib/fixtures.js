// Playwright-фикстуры для E2E тестов.
//
// Главная задача: перехватывать запрос assets/songs.json и отдавать
// детерминированную копию (e2e/data/fixtures/songs.fixture.json).
// Тесты не зависят от изменений в реальной БД (public/assets/songs.json) —
// они работают со стабильным снимком из 60 песен (1–50 + мульти-вариантные).
//
// Использование в specs:
//   import { test, expect } from '../lib/fixtures'
//   test('...', async ({ page }) => { ... })
//
// Каждый тест получает свежий BrowserContext (чистый IndexedDB), поэтому
// приложение каждый раз загружает фикстуру заново.

import { test as base, expect } from '@playwright/test'
import path from 'node:path'

// process.cwd() — корень проекта (где лежит playwright.config.js).
// Playwright всегда запускается оттуда, поэтому путь к фикстуре стабилен.
const FIXTURE_PATH = path.resolve(process.cwd(), 'e2e/data/fixtures/songs.fixture.json')

export const test = base.extend({
  // Перехват запроса songs.json на уровне page — работает для всех контекстов
  // (главная, popover песни), т.к. приложение всегда фетчит тот же URL.
  page: async ({ page }, use) => {
    await page.route('**/assets/songs.json', async (route) => {
      await route.fulfill({
        path: FIXTURE_PATH,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-cache' },
      })
    })
    await use(page)
  },
})

export { expect }
