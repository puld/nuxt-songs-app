import { readFile } from 'node:fs/promises'

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
  getShareCalls,
  seedCollectionWithSongs,
  waitForHomeReady,
  openSidebar
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

// Ступени деградации по длине ссылки. В жизни порог берут составом подборки
// (простая ссылка держит ~280 песен, сжатая ~850), но в фикстуре песен
// шестьдесят — поэтому длину набирает имя: на формат payload это не влияет.
test.describe('Поделиться подборкой: длинная ссылка', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('devMode', 'true'))
    await stubWebShare(page)
  })

  test('ссылка сверх порога уезжает сжатой', async ({ page }) => {
    await page.goto('/')
    await waitForHomeReady(page)
    // Повторяющийся текст gzip складывает в десятки байт — ссылка остаётся ссылкой.
    const name = 'Подборка молодёжного служения '.repeat(90)
    const id = await seedCollectionWithSongs(page, name, [SONGS.ONE.n, SONGS.MULTI.n])

    await page.goto(`/collections/${id}`)
    await expect(page.locator(s.collection.songItem).first()).toBeVisible()
    await expect(page.locator(s.collection.shareFallback)).toHaveCount(0)

    await page.click(s.share.button)
    const calls = await getShareCalls(page)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.length).toBeLessThanOrEqual(2000)

    // Маркер лежит вне сжатой части, поэтому читается до распаковки.
    const decoded = await page.evaluate(async (url) => {
      const data = url.split('#')[1]
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
      const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
      const split = bytes.indexOf(10)
      const format = new TextDecoder().decode(bytes.slice(0, split))
      const body = await new Response(
        new Blob([bytes.slice(split + 1)]).stream().pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer()
      return { format, text: new TextDecoder().decode(body) }
    }, calls[0].url)

    expect(decoded.format).toBe('2')
    expect(decoded.text.split('\n')[0]).toBe(name.trim())
  })

  test('когда не помогает и сжатие — подборка уезжает файлом', async ({ page }) => {
    await page.goto('/')
    await waitForHomeReady(page)
    // Случайные символы gzip не сжимает — ссылка не влезает ни в каком виде.
    const name = await page.evaluate(() => {
      const bytes = crypto.getRandomValues(new Uint8Array(3000))
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
    })
    const id = await seedCollectionWithSongs(page, name, [SONGS.ONE.n, SONGS.MULTI.n])

    await page.goto(`/collections/${id}`)
    await expect(page.locator(s.collection.shareFallback)).toBeVisible()
    // Мёртвая кнопка «Поделиться» хуже её отсутствия: ссылки не будет вовсе.
    await expect(page.locator(s.share.button)).toHaveCount(0)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click(s.collection.shareFallbackExport),
    ])

    expect(download.suggestedFilename()).toMatch(/^podborki-\d{4}-\d{2}-\d{2}\.json$/)

    // Смысл ступени только в том, что получатель этот файл откроет: формат тот
    // же, что у резервной копии, поэтому его принимает импорт в настройках.
    const saved = await readFile(await download.path(), 'utf-8')

    await page.goto('/settings')
    await page.waitForSelector(s.backup.importBtn)
    await page.setInputFiles(s.backup.fileInput, {
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: Buffer.from(saved),
    })
    await expect(page.locator(s.backup.message)).toContainText('Добавлено')

    await page.goto('/')
    await openSidebar(page)
    await expect(
      page.locator(s.sidebar.collectionName).filter({ hasText: name.slice(0, 30) })
    ).toBeVisible()
  })
})
