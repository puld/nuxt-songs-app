import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, waitForHomeReady } from '../lib/flows'

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
