import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { searchCases, rankingCases, numberCases } from '../data/search-cases'
import { FIXTURE_SONGS_COUNT } from '../lib/songs'

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

  test('фикстура загрузилась: поиск находит песни', async ({ page }) => {
    // Sanity-проверка, что фикстура перехватилась и индекс построился.
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    await page.fill(s.search.input, 'повесть')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })
    expect(FIXTURE_SONGS_COUNT).toBe(60)
  })
})
