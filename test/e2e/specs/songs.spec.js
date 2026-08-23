import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'

// Страница «Все песни»: гейт режима разработчика, три режима группировки,
// сворачивание групп, переход к песне и попап поиска.
//
// Экран закрыт `devMode`, поэтому большинство тестов включают флаг заранее:
// initScript отрабатывает до старта приложения, иначе страница успевает
// отрисовать заглушку.

/** Включает режим разработчика до загрузки приложения. */
async function enableDevMode(page) {
  await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
}

/** Открывает список песен и ждёт первую группу. */
async function gotoSongsList(page) {
  await page.goto('/songs')
  await page.waitForSelector(s.songsList.group, { timeout: 30000 })
}

test.describe('Все песни: гейт режима разработчика', () => {
  test('без devMode — заглушка вместо списка', async ({ page }) => {
    await page.goto('/songs')

    await expect(page.locator(s.songsList.stub)).toBeVisible()
    await expect(page.locator(s.songsList.stubLink)).toBeVisible()
    await expect(page.locator(s.songsList.modes)).toHaveCount(0)
    await expect(page.locator(s.songsList.group)).toHaveCount(0)
  })

  test('без devMode — кнопки поиска в навбаре нет', async ({ page }) => {
    await page.goto('/songs')

    await expect(page.locator(s.songsList.stub)).toBeVisible()
    await expect(page.locator(s.songsList.searchBtn)).toHaveCount(0)
  })

  test('пункт «Все песни» в сайдбаре появляется только с devMode', async ({ page }) => {
    await page.goto('/')
    await page.click(s.navbar.menuBtn)
    await page.waitForSelector(s.sidebar.aside)
    await expect(page.locator(s.songsList.sidebarLink)).toHaveCount(0)

    await enableDevMode(page)
    await page.goto('/')
    await page.click(s.navbar.menuBtn)
    await page.waitForSelector(s.sidebar.aside)
    await expect(page.locator(s.songsList.sidebarLink)).toBeVisible()
  })

  test('ссылка «Все песни» на главной появляется только с devMode', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    await expect(page.locator(s.songsList.homeLink)).toHaveCount(0)

    await enableDevMode(page)
    await page.goto('/')
    await page.waitForSelector(s.songsList.homeLink, { timeout: 30000 })
    await page.locator(s.songsList.homeLink).click()

    await expect(page).toHaveURL(/\/songs$/)
    await expect(page.locator(s.songsList.modes)).toBeVisible()
  })
})

test.describe('Все песни: режимы группировки', () => {
  test.beforeEach(async ({ page }) => {
    await enableDevMode(page)
  })

  test('по умолчанию — группировка по номеру, первая группа раскрыта', async ({ page }) => {
    await gotoSongsList(page)

    await expect(page.locator(s.songsList.modeActive)).toHaveText('По номеру')
    await expect(page.locator(s.songsList.groupTitle).first()).toHaveText('1–100')

    // Раскрыта только первая группа: 1565 песен разом не рендерим.
    const headers = page.locator(s.songsList.groupHeader)
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'true')
    await expect(headers.nth(1)).toHaveAttribute('aria-expanded', 'false')
  })

  test('счётчик группы совпадает с числом видимых песен', async ({ page }) => {
    await gotoSongsList(page)

    const count = await page.locator(s.songsList.groupCount).first().textContent()
    await expect(page.locator(s.songsList.group).first().locator('.song-link'))
      .toHaveCount(Number(count))
  })

  test('клик по заголовку сворачивает и разворачивает группу', async ({ page }) => {
    await gotoSongsList(page)

    const header = page.locator(s.songsList.groupHeader).first()
    await header.click()
    await expect(header).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator(s.songsList.songLink)).toHaveCount(0)

    await header.click()
    await expect(header).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(s.songsList.songLink).first()).toBeVisible()
  })

  test('по алфавиту — группа названа буквой, песни отсортированы по названию', async ({ page }) => {
    await gotoSongsList(page)
    await page.locator(s.songsList.modeBtn, { hasText: 'По алфавиту' }).click()

    await expect(page.locator(s.songsList.modeActive)).toHaveText('По алфавиту')
    await expect(page.locator(s.songsList.groupTitle).first()).toHaveText(/^\p{L}$/u)

    const titles = await page.locator(s.songsList.songTitle).allTextContents()
    expect(titles.length).toBeGreaterThan(1)
    expect(titles).toEqual([...titles].sort(new Intl.Collator('ru').compare))
  })

  test('по разделам — первая группа названа разделом сборника', async ({ page }) => {
    await gotoSongsList(page)
    await page.locator(s.songsList.modeBtn, { hasText: 'По разделам' }).click()

    await expect(page.locator(s.songsList.modeActive)).toHaveText('По разделам')
    await expect(page.locator(s.songsList.groupTitle).first())
      .toHaveText('Перед началом собрания')
    // Раздел задаёт свой порядок песен — начинается с первой песни сборника.
    await expect(page.locator(s.songsList.songNumber).first()).toHaveText(String(SONGS.ONE.n))
  })

  test('смена режима раскрывает первую группу нового режима', async ({ page }) => {
    await gotoSongsList(page)
    await page.locator(s.songsList.groupHeader).first().click()
    await expect(page.locator(s.songsList.songLink)).toHaveCount(0)

    await page.locator(s.songsList.modeBtn, { hasText: 'По алфавиту' }).click()
    await expect(page.locator(s.songsList.groupHeader).first())
      .toHaveAttribute('aria-expanded', 'true')
  })

  test('выбранный режим сохраняется до следующего открытия страницы', async ({ page }) => {
    await gotoSongsList(page)
    await page.locator(s.songsList.modeBtn, { hasText: 'По разделам' }).click()
    await expect(page.locator(s.songsList.modeActive)).toHaveText('По разделам')

    // Уход со страницы и возврат — режим не сбрасывается на «По номеру».
    await page.goto('/')
    await gotoSongsList(page)
    await expect(page.locator(s.songsList.modeActive)).toHaveText('По разделам')

    // И переживает перезапуск приложения (значение лежит в localStorage).
    await page.reload()
    await page.waitForSelector(s.songsList.group, { timeout: 30000 })
    await expect(page.locator(s.songsList.modeActive)).toHaveText('По разделам')
  })

  test('мусор в сохранённом режиме не оставляет страницу без активной кнопки', async ({ page }) => {
    // useStorage хранит строку плоско, без JSON-кавычек — так же пишем и мусор.
    await page.addInitScript(() => window.localStorage.setItem('songsListMode', 'по разделам'))
    await gotoSongsList(page)

    await expect(page.locator(s.songsList.modeActive)).toHaveText('По номеру')
    await expect(page.locator(s.songsList.groupTitle).first()).toHaveText('1–100')
  })
})

test.describe('Все песни: переходы', () => {
  test.beforeEach(async ({ page }) => {
    await enableDevMode(page)
  })

  test('клик по песне ведёт на её страницу', async ({ page }) => {
    await gotoSongsList(page)

    const number = await page.locator(s.songsList.songNumber).first().textContent()
    await page.locator(s.songsList.songLink).first().click()

    await expect(page).toHaveURL(new RegExp(`/song/${number.trim()}$`))
    await expect(page.locator(s.song.title)).toBeVisible()
  })

  test('поиск из навбара открывает попап и ведёт к песне', async ({ page }) => {
    await gotoSongsList(page)

    await page.click(s.songsList.searchBtn)
    await page.waitForSelector(s.goto.overlay)

    await page.fill(s.search.input, SONGS.ONE.title.slice(0, 20))
    await page.waitForSelector(s.search.resultItem)
    await page.locator(s.search.resultItem).first().click()

    await expect(page.locator(s.goto.overlay)).toHaveCount(0)
    await expect(page).toHaveURL(/\/song\/\d+/)
  })
})
