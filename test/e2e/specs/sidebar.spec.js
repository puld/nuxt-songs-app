import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { openSidebar, closeSidebar, waitForHomeReady } from '../lib/flows'

// Сайдбар: открытие/закрытие, навигация, список подборок с счётчиками,
// «Избранное» первым.

test.describe('Сайдбар', () => {
  test.beforeEach(async ({ page }) => {
    await waitForHomeReady(page)
  })

  test('гамбургер открывает сайдбар со структурой', async ({ page }) => {
    await openSidebar(page)
    await expect(page.locator(s.sidebar.aside)).toBeVisible()
    await expect(page.locator(s.sidebar.overlay)).toBeVisible()

    // Структура: Главная, секция «Подборки», Настройки внизу.
    await expect(page.locator(`${s.sidebar.link}:has-text("Главная")`)).toBeVisible()
    await expect(page.locator(`${s.sidebar.sectionHeader}:has-text("Подборки")`)).toBeVisible()
    await expect(page.locator(`${s.sidebar.bottom} ${s.sidebar.link}:has-text("Настройки")`)).toBeVisible()
  })

  test('«Избранное» первое со звёздочкой и счётчиком', async ({ page }) => {
    await openSidebar(page)
    const first = page.locator(s.sidebar.collectionLink).first()
    await expect(first).toContainText('Избранное')
    await expect(first.locator(s.sidebar.favoriteIcon)).toBeVisible()
    await expect(first.locator(s.sidebar.collectionCount)).toBeVisible()
  })

  test('клик по «Главная» → переход + закрытие', async ({ page }) => {
    await openSidebar(page)
    await page.locator(`${s.sidebar.link}:has-text("Главная")`).click()
    await expect(page.locator(s.sidebar.aside)).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)
  })

  test('клик по «Настройки» → переход + закрытие', async ({ page }) => {
    await openSidebar(page)
    await page.locator(`${s.sidebar.bottom} ${s.sidebar.link}:has-text("Настройки")`).click()
    await expect(page.locator(s.sidebar.aside)).toHaveCount(0)
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('клик по overlay закрывает сайдбар', async ({ page }) => {
    await openSidebar(page)
    await closeSidebar(page)
    await expect(page.locator(s.sidebar.aside)).toHaveCount(0)
  })

  test('клик по подборке → переход на /collections/{id} + закрытие', async ({ page }) => {
    await openSidebar(page)
    await page.locator(s.sidebar.collectionLink).first().click()
    await expect(page.locator(s.sidebar.aside)).toHaveCount(0)
    await expect(page).toHaveURL(/\/collections\/\d+$/)
  })

  test('кнопка закрытия в шапке сайдбара', async ({ page }) => {
    await openSidebar(page)
    await page.locator(s.sidebar.closeBtn).click()
    await expect(page.locator(s.sidebar.aside)).toHaveCount(0)
  })
})
