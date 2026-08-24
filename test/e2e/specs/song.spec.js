import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { LAST_SECTION, SONGS, sectionOfSong } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Страница песни: отображение текста, варианты, навигация между песнями,
// обработка несуществующей песни.

/** Включает режим разработчика до старта приложения. */
async function enableDevMode(page) {
  await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
}

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

test.describe('Страница песни: раздел сборника', () => {
  // Ссылка ведёт на `/songs`, который сам закрыт режимом разработчика,
  // поэтому и она живёт за тем же гейтом.
  test('без devMode ссылки на раздел нет', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)

    await expect(page.locator(s.song.title)).toBeVisible()
    await expect(page.locator(s.song.sectionLink)).toHaveCount(0)
  })

  test('с devMode показан раздел песни и ведёт в список к нему', async ({ page }) => {
    const section = sectionOfSong(SONGS.ONE.n)
    await enableDevMode(page)
    await gotoSong(page, SONGS.ONE.n)

    await expect(page.locator(s.song.sectionLinkTitle)).toHaveText(section.title)
    await expect(page.locator(s.song.sectionLink))
      .toHaveAttribute('href', new RegExp(`/songs#section-${section.id}$`))
  })

  test('клик по разделу раскрывает его в списке песен', async ({ page }) => {
    const section = sectionOfSong(SONGS.MULTI.n)
    await enableDevMode(page)
    await gotoSong(page, SONGS.MULTI.n)

    await page.locator(s.song.sectionLink).click()

    await expect(page).toHaveURL(new RegExp(`/songs#section-${section.id}$`))
    await expect(page.locator(s.songsList.modeActive)).toHaveText('По разделам')
    // Раздел раскрыт: песня, с которой пришли, видна без лишних кликов.
    await expect(
      page.locator(`${s.songsList.groupByKey(`section-${section.id}`)} .song-link`)
    ).toContainText(SONGS.MULTI.title)
  })

  test('переход по ссылке прокручивает список к разделу', async ({ page }) => {
    // Клик — это SPA-переход, а не загрузка страницы: список песен уже в
    // кэше, и порядок «рендер → прокрутка» здесь другой.
    await page.setViewportSize({ width: 375, height: 500 })
    await enableDevMode(page)
    await gotoSong(page, LAST_SECTION.songNumbers[0])

    await page.locator(s.song.sectionLink).click()
    await page.waitForSelector(s.songsList.group, { timeout: 30000 })

    const group = page.locator(s.songsList.groupByKey(`section-${LAST_SECTION.id}`))
    await expect(group.locator('.group-header')).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })
})
