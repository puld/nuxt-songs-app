import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Страница песни: отображение текста, варианты, навигация между песнями,
// обработка несуществующей песни.

test.describe('Страница песни: отображение', () => {
  test('название и структура текста (куплет/припев)', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.song.title)).toHaveText(SONGS.ONE.title)

    // Хотя бы один куплет с номером.
    await expect(page.locator(s.song.verse + ' ' + s.song.partLabel).first()).toContainText(/^\d+\.$/)

    // Если припев есть — он помечен «Припев:».
    const chorusCount = await page.locator(s.song.chorusLabel).count()
    if (chorusCount > 0) {
      await expect(page.locator(s.song.chorusLabel).first()).toHaveText('Припев:')
    }
  })

  test('навбар: «№ N» + стрелки навигации', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.navbar.titleBtn)).toHaveText(`№ ${SONGS.ONE.n}`)
    await expect(page.locator(s.navbar.nextBtn)).toBeVisible()
    // На первой песне стрелки «пред.» нет.
    await expect(page.locator(s.navbar.prevBtn)).toHaveCount(0)
  })

  test('стрелка «следующая» → переход к N+1', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.navbar.nextBtn)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.TWO.n}$`))
    await expect(page.locator(s.song.title)).toHaveText(SONGS.TWO.title)
  })

  test('стрелка «предыдущая» → переход к N-1', async ({ page }) => {
    await gotoSong(page, SONGS.TWO.n)
    await page.click(s.navbar.prevBtn)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
  })

  test('несуществующая песня → «Песня не найдена»', async ({ page }) => {
    await page.goto(`/song/${SONGS.NONEXISTENT}`)
    await expect(page.locator(s.song.notFound)).toBeVisible({ timeout: 15000 })
    await expect(page.locator(s.song.backHome)).toBeVisible()
  })
})

test.describe('Страница песни: варианты', () => {
  test('мульти-вариант — табы видимы с метками', async ({ page }) => {
    await gotoSong(page, SONGS.MULTI.n)
    const tabs = page.locator(s.song.variantTab)
    await expect(tabs).toHaveCount(SONGS.MULTI.labels.length)
    for (let i = 0; i < SONGS.MULTI.labels.length; i++) {
      await expect(tabs.nth(i)).toHaveText(SONGS.MULTI.labels[i])
    }
    await expect(tabs.first()).toHaveClass(/active/)
  })

  test('переключение таба меняет URL на ?v={index}', async ({ page }) => {
    await gotoSong(page, SONGS.MULTI.n)
    await page.locator(s.song.variantTab).nth(1).click()
    await expect(page.locator(s.song.variantTab).nth(1)).toHaveClass(/active/)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.MULTI.n}\\?v=1$`))
  })

  test('прямой заход ?v=1 открывает второй вариант', async ({ page }) => {
    await page.goto(`/song/${SONGS.MULTI.n}?v=1`)
    await page.waitForSelector(s.song.title, { timeout: 30000 })
    await expect(page.locator(s.song.variantTab).nth(1)).toHaveClass(/active/)
  })

  test('песня без вариантов — табы не отображаются', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.song.variantTabs)).toHaveCount(0)
  })

  test('описательные метки вариантов отображаются как есть', async ({ page }) => {
    await gotoSong(page, SONGS.MULTI_DESCRIPTIVE.n)
    const tabs = page.locator(s.song.variantTab)
    await expect(tabs).toHaveCount(SONGS.MULTI_DESCRIPTIVE.labels.length)
    for (let i = 0; i < SONGS.MULTI_DESCRIPTIVE.labels.length; i++) {
      await expect(tabs.nth(i)).toHaveText(SONGS.MULTI_DESCRIPTIVE.labels[i])
    }
  })
})
