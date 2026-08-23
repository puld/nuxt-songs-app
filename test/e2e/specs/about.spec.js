import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { openSidebar, waitForHomeReady, gotoSong } from '../lib/flows'
import { SONGS } from '../lib/songs'
import { TAPS_REQUIRED } from '../../../lib/devMode'
import { CHANGELOG, CHANGELOG_PREVIEW } from '../../../lib/changelog'

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

// Блок диагностики: делает видимым то, что раньше уходило только в консоль —
// сколько песен и подборок в базе, выдано ли постоянное хранилище, есть ли
// резервная копия и почему база не открылась.
test.describe('О приложении: состояние хранилища', () => {
  const row = (page, label) =>
    page.locator(s.about.diagnosticsRow).filter({ hasText: label })

  const value = (page, label) => row(page, label).locator(s.about.diagnosticsValue)

  test('показывает счётчики базы', async ({ page }) => {
    await page.goto('/about')

    await expect(page.locator(s.about.diagnostics)).toBeVisible()
    // Песни грузятся при первом запуске — ждём ненулевого счётчика
    await expect
      .poll(async () => Number(await value(page, 'Песен в базе').textContent()), { timeout: 30000 })
      .toBeGreaterThan(0)
    await expect(row(page, 'Постоянное хранилище')).toBeVisible()
  })

  test('технические строки скрыты без режима разработчика', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator(s.about.diagnostics)).toBeVisible()

    await expect(row(page, 'Версия базы')).toHaveCount(0)
    await expect(row(page, 'Занято места')).toHaveCount(0)
  })

  test('в режиме разработчика видны версия базы и занятое место', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.goto('/about')

    await expect(row(page, 'Версия базы')).toBeVisible()
    await expect(row(page, 'Занято места')).toBeVisible()
  })

  test('добавленная песня видна в счётчиках', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()

    await page.goto('/about')
    await expect(value(page, 'Песен в подборках')).toHaveText('1')
    await expect(value(page, 'Резервная копия')).toContainText('подборок / песен')
  })

  test('отказ базы виден на странице, а не только в консоли', async ({ page }) => {
    // Так выглядит запрет IndexedDB настройками приватности
    await page.addInitScript(() => {
      indexedDB.open = () => { throw new Error('IndexedDB запрещён настройками') }
    })
    await page.goto('/about')

    await expect(page.locator(s.about.diagnosticsError)).toBeVisible()
    await expect(page.locator(s.about.diagnosticsError)).toContainText('IndexedDB запрещён настройками')
  })
})


// Секция «Что нового»: список версий с описанием изменений. За режимом
// разработчика — обычному пользователю номера версий ничего не говорят.
test.describe('О приложении: что нового', () => {
  test('без режима разработчика секции нет', async ({ page }) => {
    await page.goto('/about')

    await expect(page.locator(s.about.page)).toBeVisible()
    await expect(page.locator(s.about.changelog)).toHaveCount(0)
  })

  test('в режиме разработчика показаны последние версии', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.goto('/about')

    await expect(page.locator(s.about.changelog)).toBeVisible()
    await expect(page.locator(s.about.changelogItem)).toHaveCount(CHANGELOG_PREVIEW)

    // Свежая версия — первой
    await expect(page.locator(s.about.changelogVersion).first()).toHaveText(CHANGELOG[0].version)
  })

  test('«Показать все версии» разворачивает и сворачивает список', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.goto('/about')

    const toggle = page.locator(s.about.changelogToggle)
    await toggle.click()
    await expect(page.locator(s.about.changelogItem)).toHaveCount(CHANGELOG.length)

    await toggle.click()
    await expect(page.locator(s.about.changelogItem)).toHaveCount(CHANGELOG_PREVIEW)
  })
})
