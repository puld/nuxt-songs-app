// E2E-тесты на PWA install-flow на главной странице.
//
// Кнопка «Установить приложение» управляется @vite-pwa/nuxt плагином:
// - showInstallPrompt становится true после события beforeinstallprompt
// - isPWAInstalled истинно, если запущено в display-mode: standalone (или iOS)
// - install() вызывает deferredPrompt.prompt()
//
// Chromium в Playwright НЕ эмитит beforeinstallprompt автоматически,
// поэтому событие диспатчится вручную через dispatchBeforeInstallPrompt().
//
// Связано: pages/index.vue (showInstallButton computed), nuxt.config.js (pwa.client).

import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import {
  waitForHomeReady,
  dispatchBeforeInstallPrompt,
  resetPromptCalledMarker,
  wasPromptCalled,
} from '../lib/flows'

test.describe('PWA: кнопка установки на главной', () => {
  test.beforeEach(async ({ page }) => {
    await waitForHomeReady(page)
  })

  test('кнопка скрыта по умолчанию (до beforeinstallprompt)', async ({ page }) => {
    await expect(page.locator(s.home.installBtn)).toHaveCount(0)
  })

  test('кнопка появляется после beforeinstallprompt', async ({ page }) => {
    await dispatchBeforeInstallPrompt(page)
    await expect(page.locator(s.home.installBtn)).toBeVisible()
    await expect(page.locator(s.home.installBtn)).toHaveText(/Установить приложение/)
  })

  test('клик по кнопке вызывает deferredPrompt.prompt()', async ({ page }) => {
    await resetPromptCalledMarker(page)
    await dispatchBeforeInstallPrompt(page)
    await expect(page.locator(s.home.installBtn)).toBeVisible()

    await page.click(s.home.installBtn)

    expect(await wasPromptCalled(page), 'prompt() должен быть вызван после клика').toBe(true)
  })

  test('после клика кнопка скрывается', async ({ page }) => {
    await dispatchBeforeInstallPrompt(page)
    await expect(page.locator(s.home.installBtn)).toBeVisible()

    await page.click(s.home.installBtn)

    // Transition fade: ждём исчезновения
    await expect(page.locator(s.home.installBtn)).toHaveCount(0, { timeout: 3000 })
  })

  test('кнопка не появляется повторно после dismiss (outcome=dismissed)', async ({ page }) => {
    await dispatchBeforeInstallPrompt(page, { outcome: 'dismissed' })
    await expect(page.locator(s.home.installBtn)).toBeVisible()

    await page.click(s.home.installBtn)

    // После dismiss prompt() вызывается, но showInstallPrompt сбрасывается.
    expect(await wasPromptCalled(page)).toBe(true)
    await expect(page.locator(s.home.installBtn)).toHaveCount(0, { timeout: 3000 })
  })
})

test.describe('PWA: уже установленное приложение', () => {
  // Когда PWA запущено standalone (display-mode: standalone), isPWAInstalled = true,
  // и computed showInstallButton всегда false — даже если пришло beforeinstallprompt.
  // Эмулируем standalone через emulateMedia.
  test('в display-mode: standalone кнопка скрыта даже после beforeinstallprompt', async ({ page }) => {
    await page.emulateMedia({ media: 'screen', colorScheme: 'light' })
    // Подменяем matchMedia для display-mode: standalone ДО загрузки страницы,
    // т.к. плагин читает его однажды при инициализации.
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        if (query === '(display-mode: standalone)' || query === '(display-mode: minimal-ui)') {
          return { matches: true, media: query, onchange: null,
            addListener: () => {}, removeListener: () => {},
            addEventListener: () => {}, removeEventListener: () => {},
            dispatchEvent: () => false }
        }
        return orig(query)
      }
    })

    await waitForHomeReady(page)
    await dispatchBeforeInstallPrompt(page)

    // isPWAInstalled=true → showInstallButton=false → кнопки нет
    await expect(page.locator(s.home.installBtn)).toHaveCount(0)
  })
})
