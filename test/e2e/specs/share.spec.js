import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import {
  gotoSong,
  createCollectionFromSong,
  openCollectionByName,
  uniqueCollectionName,
  stubWebShare,
  removeWebShare,
  getShareCalls
} from '../lib/flows'

// «Поделиться»: ссылка на песню (открыта всем) и ссылка на подборку
// (кодированная, за режимом разработчика).

test.describe('Поделиться песней', () => {
  test.beforeEach(async ({ page }) => {
    await stubWebShare(page)
  })

  test('кнопка доступна без режима разработчика', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.share.button)).toBeVisible()
  })

  test('в шторку уходит адрес песни и её номер с названием', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.share.button)

    const calls = await getShareCalls(page)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain(`/song/${SONGS.ONE.n}`)
    expect(calls[0].url).toMatch(/^https?:\/\//)
    expect(calls[0].title).toBe(`№ ${SONGS.ONE.n}. ${SONGS.ONE.title}`)
  })

  test('выбранный вариант попадает в ссылку', async ({ page }) => {
    await gotoSong(page, SONGS.MULTI.n)
    await page.locator(s.song.variantTab).nth(1).click()
    await expect(page).toHaveURL(/\?v=1/)

    await page.click(s.share.button)

    const calls = await getShareCalls(page)
    expect(calls[0].url).toContain(`/song/${SONGS.MULTI.n}?v=1`)
    // Метка варианта — в подписи: получатель видит, какой именно вариант прислали.
    expect(calls[0].title).toContain(SONGS.MULTI.labels[1])
  })

  test('без Web Share ссылка копируется в буфер', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await removeWebShare(page)

    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.share.button)

    await expect(page.locator(s.share.toast)).toHaveText('Ссылка скопирована')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain(`/song/${SONGS.ONE.n}`)
  })
})

test.describe('Поделиться подборкой', () => {
  test.beforeEach(async ({ page }) => {
    await stubWebShare(page)
  })

  test('без режима разработчика кнопки нет', async ({ page }) => {
    const name = uniqueCollectionName('Share')
    await createCollectionFromSong(page, SONGS.ONE.n, name)
    await openCollectionByName(page, name)

    await expect(page.locator(s.collection.songItem).first()).toBeVisible()
    await expect(page.locator(s.share.button)).toHaveCount(0)
  })

  test('с режимом разработчика ссылка ведёт на импорт и несёт состав подборки', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('devMode', 'true'))

    const name = uniqueCollectionName('Share')
    await createCollectionFromSong(page, SONGS.ONE.n, name)
    await openCollectionByName(page, name)

    await expect(page.locator(s.share.button)).toBeVisible()
    await page.click(s.share.button)

    const calls = await getShareCalls(page)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/collections/import#')
    expect(calls[0].title).toBe(`Подборка «${name}»`)

    // Payload разбирается обратно: имя и номер песни на месте.
    const payload = await page.evaluate((url) => {
      const data = url.split('#')[1]
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
      const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
      return new TextDecoder('utf-8').decode(bytes)
    }, calls[0].url)

    const [format, payloadName, , list] = payload.split('\n')
    expect(format).toBe('1')
    expect(payloadName).toBe(name)
    expect(list).toBe(String(SONGS.ONE.n))
  })

  test('«Избранным» не делятся', async ({ page }) => {
    // Своё «Избранное» есть у каждого — подменять его чужим нечего.
    await page.addInitScript(() => localStorage.setItem('devMode', 'true'))

    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.favoriteStar)
    await expect(page.locator(s.navbar.favoriteStarActive)).toBeVisible()

    await page.goto('/')
    await page.click(s.navbar.menuBtn)
    await page.locator(s.sidebar.collectionLink, { hasText: 'Избранное' }).click()
    await page.waitForURL(/\/collections\/\d+$/)

    await expect(page.locator(s.collection.songItem).first()).toBeVisible()
    await expect(page.locator(s.share.button)).toHaveCount(0)
  })
})
