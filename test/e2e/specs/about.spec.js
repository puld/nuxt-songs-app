import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { openSidebar, waitForHomeReady } from '../lib/flows'
import { TAPS_REQUIRED } from '../../../lib/devMode'

// Страница «О приложении»: шпаргалка по экранам, блок версии,
// активация режима разработчика семью тапами по версии (Android-style).
//
// Порог тапов берём из lib/devMode.js — тест не должен разъезжаться
// с кодом, если порог поменяют.

/**
 * Тапает по блоку версии заданное число раз.
 * Тапы идут подряд, чтобы не выйти за окно сброса счётчика (2 сек).
 */
const tapVersion = async (page, times) => {
  const version = page.locator(s.about.versionBtn)
  for (let i = 0; i < times; i++) {
    await version.click()
  }
}

test.describe('О приложении', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about')
  })

  test('заголовок «О приложении» в навбаре', async ({ page }) => {
    await expect(page.locator(s.navbar.title)).toHaveText('О приложении')
  })

  test('шпаргалка по экранам не пустая', async ({ page }) => {
    const items = page.locator(s.about.guideItem)
    await expect(items.first()).toBeVisible()
    expect(await items.count()).toBeGreaterThanOrEqual(4)

    // У каждого пункта есть и заголовок, и пояснение
    await expect(page.locator(s.about.guideTitle).first()).not.toBeEmpty()
    await expect(page.locator(s.about.guideText).first()).not.toBeEmpty()
  })

  test('блок версии показывает версию и сборку', async ({ page }) => {
    const values = page.locator(s.about.versionValue)
    await expect(values).toHaveCount(2)
    await expect(values.first()).not.toBeEmpty()
    await expect(values.nth(1)).not.toBeEmpty()
  })

  test('кнопка «Назад» в навбаре работает', async ({ page }) => {
    await waitForHomeReady(page)
    await openSidebar(page)
    await page.locator(`${s.sidebar.link}:has-text("О приложении")`).click()
    await expect(page).toHaveURL(/\/about$/)

    await page.locator(s.navbar.backBtn).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('О приложении: активация режима разработчика', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about')
  })

  test('по умолчанию режим выключен и статуса нет', async ({ page }) => {
    await expect(page.locator(s.about.devModeStatus)).toHaveCount(0)
    await expect(page.locator(s.about.devModeMessage)).toHaveCount(0)
  })

  test('первые тапы молчат — режим скрытый', async ({ page }) => {
    await tapVersion(page, 3)
    await expect(page.locator(s.about.devModeMessage)).toHaveCount(0)
    await expect(page.locator(s.about.devModeStatus)).toHaveCount(0)
  })

  test('на подходе к порогу появляется подсказка об остатке', async ({ page }) => {
    // Один тап до порога → остаток 1
    await tapVersion(page, TAPS_REQUIRED - 1)
    await expect(page.locator(s.about.devModeMessage)).toContainText('Осталось 1')
    await expect(page.locator(s.about.devModeStatus)).toHaveCount(0)
  })

  test(`${TAPS_REQUIRED} тапов включают режим разработчика`, async ({ page }) => {
    await tapVersion(page, TAPS_REQUIRED)

    await expect(page.locator(s.about.devModeMessage)).toContainText('включён')
    await expect(page.locator(s.about.devModeStatus)).toBeVisible()
  })

  test('режим сохраняется после перезагрузки', async ({ page }) => {
    await tapVersion(page, TAPS_REQUIRED)
    await expect(page.locator(s.about.devModeStatus)).toBeVisible()

    await page.reload()
    await expect(page.locator(s.about.devModeStatus)).toBeVisible()
  })

  test('после активации в настройках есть «Экспериментальные функции»', async ({ page }) => {
    await tapVersion(page, TAPS_REQUIRED)

    await page.goto('/settings')
    const section = page.locator(s.settings.section, { hasText: 'Экспериментальные функции' })
    await expect(section).toBeVisible()
  })

  test('до активации секции «Экспериментальные функции» в настройках нет', async ({ page }) => {
    await page.goto('/settings')
    await expect(
      page.locator(s.settings.section, { hasText: 'Экспериментальные функции' })
    ).toHaveCount(0)
  })

  test('тумблер в настройках выключает режим', async ({ page }) => {
    await tapVersion(page, TAPS_REQUIRED)
    await page.goto('/settings')

    const section = page.locator(s.settings.section, { hasText: 'Экспериментальные функции' })
    await section.locator(s.settings.slider).click()

    // Секция исчезает вместе с режимом
    await expect(section).toHaveCount(0)

    // И на странице «О приложении» статус тоже пропал
    await page.goto('/about')
    await expect(page.locator(s.about.devModeStatus)).toHaveCount(0)
  })

  test('тап по версии при включённом режиме сообщает, что он уже включён', async ({ page }) => {
    await tapVersion(page, TAPS_REQUIRED)
    await tapVersion(page, 1)

    await expect(page.locator(s.about.devModeMessage)).toContainText('уже включён')
  })
})
