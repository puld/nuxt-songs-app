import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { searchCases, rankingCases, numberCases } from '../data/search-cases'
import { FIXTURE_SONGS_COUNT, FIXTURE_SONG_NUMBERS, SONGS } from '../lib/songs'
import { RECENT_LIMIT } from '../../../lib/recentSongs'

// Главная страница: полнотекстовый поиск, поиск по номеру, инструкции.
// Поисковый индекс строится в onMounted SongSearchInput; результаты
// обновляются на каждый ввод символа (@input).

test.describe('Главная: поиск', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
  })

  for (const { query, expectedNumbers, description, minExpected } of searchCases) {
    test(description, async ({ page }) => {
      await page.fill(s.search.input, query)
      await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })

      const numbers = await page.locator(s.search.resultNumber).allTextContents()
      const parsed = numbers.map((n) => parseInt(n.trim(), 10))

      for (const expected of expectedNumbers) {
        expect(parsed, `запрос «${query}»: ожидается #${expected} в [${parsed.join(', ')}]`).toContain(expected)
      }
      if (minExpected) {
        expect(parsed.length, `запрос «${query}»: минимум ${minExpected} результатов`).toBeGreaterThanOrEqual(minExpected)
      }
    })
  }

  test.describe('ранжирование', () => {
    for (const { query, expectedFirst, description } of rankingCases) {
      test(description, async ({ page }) => {
        await page.fill(s.search.input, query)
        await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })

        const first = await page.locator(s.search.resultNumber).first().textContent()
        expect(parseInt(first.trim(), 10), `«${query}»: первым должен быть #${expectedFirst}`).toBe(expectedFirst)
      })
    }
  })

  test.describe('поиск по номеру', () => {
    for (const { number, expectedTitle } of numberCases) {
      test(`номер ${number} → Enter → «${expectedTitle}»`, async ({ page }) => {
        await page.fill(s.search.input, String(number))
        await page.press(s.search.input, 'Enter')

        await expect(page).toHaveURL(/\/song\/\d+/, { timeout: 10000 })
        await expect(page.locator(s.song.title)).toHaveText(expectedTitle)
      })
    }

    test('несуществующий номер: перехода нет', async ({ page }) => {
      await page.fill(s.search.input, '999999')
      await page.press(s.search.input, 'Enter')
      await expect(page).toHaveURL(/\/$/)
    })

    test('числовой запрос скрывает dropdown', async ({ page }) => {
      await page.fill(s.search.input, 'Бог')
      await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
      await page.fill(s.search.input, '42')
      await expect(page.locator(s.search.results)).toHaveCount(0)
    })
  })

  test('клик по результату → переход на страницу песни', async ({ page }) => {
    await page.fill(s.search.input, 'повесть любви')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
    await page.locator(s.search.resultItem).first().click()
    await expect(page).toHaveURL(/\/song\/1$/, { timeout: 10000 })
  })

  test('очистка поля скрывает dropdown', async ({ page }) => {
    await page.fill(s.search.input, 'Бог')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
    await page.fill(s.search.input, '')
    await expect(page.locator(s.search.results)).toHaveCount(0)
  })

  test('лимит результатов: максимум 7', async ({ page }) => {
    await page.fill(s.search.input, 'Бог')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
    const count = await page.locator(s.search.resultItem).count()
    expect(count).toBeLessThanOrEqual(7)
  })
})

test.describe('Главная: инструкции и пустое состояние', () => {
  test('инструкции: 3+ пункта при пустом избранном', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    const items = page.locator(`${s.home.instructionExtended} li`)
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('ссылка «Подробнее» внутри плашки ведёт на /about', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })

    // Ссылка должна быть частью плашки инструкции, а не висеть отдельно
    const more = page.locator(`${s.home.instructionExtended} ${s.home.instructionMore}`)
    await expect(more).toBeVisible()

    await more.click()
    await expect(page).toHaveURL(/\/about$/, { timeout: 10000 })
  })

  test('фикстура загрузилась: поиск находит песни', async ({ page }) => {
    // Sanity-проверка, что фикстура перехватилась и индекс построился.
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    await page.fill(s.search.input, 'повесть')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
    expect(FIXTURE_SONGS_COUNT).toBe(60)
  })
})

// Недавно открытые песни. Блок за `devMode`, поэтому флаг ставится initScript'ом
// до старта приложения — иначе главная успевает отрисоваться без него.
// Лимит берём из lib/recentSongs.js, чтобы тест не разъезжался с кодом.

/** Включает режим разработчика до загрузки приложения. */
async function enableDevMode(page) {
  await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
}

/** Открывает песню и дожидается её загрузки. */
async function visitSong(page, number) {
  await page.goto(`/song/${number}`)
  await page.waitForSelector(s.song.title, { timeout: 30000 })
}

test.describe('Главная: недавние песни', () => {
  test('без devMode блока нет, даже когда история непуста', async ({ page }) => {
    await visitSong(page, SONGS.ONE.n)
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })

    await expect(page.locator(s.home.recent)).toHaveCount(0)
  })

  test('с devMode, но пустой историей блок не появляется', async ({ page }) => {
    await enableDevMode(page)
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })

    await expect(page.locator(s.home.recent)).toHaveCount(0)
  })

  test('открытая песня попадает в список и ведёт обратно на свою страницу', async ({ page }) => {
    await enableDevMode(page)
    await visitSong(page, SONGS.ONE.n)
    await page.goto('/')

    const item = page.locator(s.home.recentItem).first()
    await expect(item).toBeVisible({ timeout: 30000 })
    await expect(item.locator(s.home.recentNumber)).toHaveText(String(SONGS.ONE.n))
    await expect(item.locator(s.home.recentName)).toHaveText(SONGS.ONE.title)

    await item.click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`), { timeout: 10000 })
  })

  test('свежая песня первая, повторное открытие не плодит записей', async ({ page }) => {
    await enableDevMode(page)
    await visitSong(page, SONGS.ONE.n)
    await visitSong(page, SONGS.TWO.n)
    await visitSong(page, SONGS.ONE.n)
    await page.goto('/')
    await page.waitForSelector(s.home.recentItem, { timeout: 30000 })

    const numbers = await page.locator(s.home.recentNumber).allTextContents()
    expect(numbers.map((n) => parseInt(n, 10))).toEqual([SONGS.ONE.n, SONGS.TWO.n])
  })

  test('список не длиннее лимита: самая старая песня вытесняется', async ({ page }) => {
    await enableDevMode(page)
    const visited = FIXTURE_SONG_NUMBERS.slice(0, RECENT_LIMIT + 1)
    for (const number of visited) {
      await visitSong(page, number)
    }
    await page.goto('/')
    await page.waitForSelector(s.home.recentItem, { timeout: 30000 })

    const numbers = (await page.locator(s.home.recentNumber).allTextContents())
      .map((n) => parseInt(n, 10))

    expect(numbers).toHaveLength(RECENT_LIMIT)
    expect(numbers).toEqual([...visited].reverse().slice(0, RECENT_LIMIT))
    expect(numbers).not.toContain(visited[0])
  })

  test('песня, которой нет в базе, из списка выпадает', async ({ page }) => {
    // История переживает обновление базы: номер мог исчезнуть, и ссылка
    // «Неизвестная песня» пользователю ничего не даёт.
    await enableDevMode(page)
    await page.addInitScript((n) => {
      window.localStorage.setItem('recentSongs', JSON.stringify([n, 999999]))
    }, SONGS.ONE.n)
    await page.goto('/')
    await page.waitForSelector(s.home.recentItem, { timeout: 30000 })

    await expect(page.locator(s.home.recentItem)).toHaveCount(1)
    await expect(page.locator(s.home.recentNumber)).toHaveText(String(SONGS.ONE.n))
  })
})
