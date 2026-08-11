import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, waitForHomeReady, openSidebar } from '../lib/flows'

// Резервная копия подборок в localStorage: снимается при изменениях,
// предлагается к восстановлению, когда IndexedDB опустела.
//
// Сценарий потери данных воспроизводится удалением базы — именно так это
// выглядит после освобождения хранилища браузером.

/** Удаляет IndexedDB, оставляя localStorage нетронутым. */
async function dropDatabase(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('SongsDB')
    request.onsuccess = resolve
    request.onerror = resolve
    request.onblocked = resolve
  }))
}

const readBackup = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('collectionsBackup') || 'null'))

test.describe('Резервная копия подборок', () => {
  test('добавление в избранное попадает в копию', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()

    await expect.poll(() => readBackup(page)).not.toBeNull()

    const backup = await readBackup(page)
    expect(backup.links).toHaveLength(1)
    expect(backup.links[0].songNumber).toBe(SONGS.ONE.n)
  })

  test('после потери базы предлагается восстановление', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()
    await expect.poll(() => readBackup(page)).not.toBeNull()

    await dropDatabase(page)
    await waitForHomeReady(page)

    await expect(page.locator(s.backup.toast)).toBeVisible({ timeout: 30000 })
    await expect(page.locator(s.backup.toast)).toContainText('резервная копия')
  })

  test('восстановление возвращает песню в избранное', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()
    await expect.poll(() => readBackup(page)).not.toBeNull()

    await dropDatabase(page)
    await waitForHomeReady(page)
    await page.locator(s.backup.apply).click({ timeout: 30000 })

    // Компонент перезагружает страницу — ждём, пока предложение исчезнет
    await expect(page.locator(s.backup.toast)).toBeHidden({ timeout: 30000 })

    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()
  })

  test('отказ удаляет копию, и предложение больше не появляется', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()
    await expect.poll(() => readBackup(page)).not.toBeNull()

    await dropDatabase(page)
    await waitForHomeReady(page)
    await page.locator(s.backup.dismiss).click({ timeout: 30000 })

    await expect(page.locator(s.backup.toast)).toBeHidden()
    expect(await readBackup(page)).toBeNull()

    await waitForHomeReady(page)
    await expect(page.locator(s.backup.toast)).toBeHidden()
  })

  test('при живых подборках предложение не показывается', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()

    await waitForHomeReady(page)

    await expect(page.locator(s.backup.toast)).toBeHidden()
  })
})

test.describe('Экспорт и импорт подборок в настройках', () => {
  /** Включает режим разработчика до загрузки страницы — за ним спрятан импорт. */
  async function enableDevMode(page) {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
  }

  test('экспорт скачивает файл с подборками', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()

    await page.goto('/settings')
    await page.waitForSelector(s.backup.section)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click(s.backup.exportBtn),
    ])

    expect(download.suggestedFilename()).toMatch(/^podborki-\d{4}-\d{2}-\d{2}\.json$/)
    await expect(page.locator(s.backup.message)).toContainText('Сохранено')
  })

  test('пустую базу экспортировать нечего', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForSelector(s.backup.section)

    await page.click(s.backup.exportBtn)

    // «Избранное» есть всегда — но пустое оно копией не считается
    await expect(page.locator(s.backup.message)).toContainText('сохранять нечего')
  })

  test('без режима разработчика импорта нет', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForSelector(s.backup.section)

    await expect(page.locator(s.backup.exportBtn)).toBeVisible()
    await expect(page.locator(s.backup.importBtn)).toHaveCount(0)
    await expect(page.locator(s.backup.fileInput)).toHaveCount(0)
  })

  test('импорт добавляет подборку из файла', async ({ page }) => {
    await enableDevMode(page)
    await page.goto('/settings')
    await page.waitForSelector(s.backup.importBtn)

    await page.setInputFiles(s.backup.fileInput, {
      name: 'podborki.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        v: 1,
        savedAt: '2026-08-10T10:00:00.000Z',
        collections: [{ id: 5, name: 'Пасха' }],
        links: [{ collectionId: 5, songNumber: SONGS.ONE.n, variantIndex: 0 }],
      })),
    })

    await expect(page.locator(s.backup.message)).toContainText('Добавлено')

    // Подборка появилась в сайдбаре — значит попала в базу, а не только в текст
    await page.goto('/')
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionName).filter({ hasText: 'Пасха' })).toBeVisible()
  })

  test('чужой файл отвергается с понятным сообщением', async ({ page }) => {
    await enableDevMode(page)
    await page.goto('/settings')
    await page.waitForSelector(s.backup.importBtn)

    await page.setInputFiles(s.backup.fileInput, {
      name: 'wrong.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"songs":[]}'),
    })

    await expect(page.locator(s.backup.message)).toContainText('не резервная копия')
    await expect(page.locator(s.backup.message)).toHaveClass(/error/)
  })
})
