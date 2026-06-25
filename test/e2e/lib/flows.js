// Переиспользуемые сценарии для E2E тестов.
// Импортируются в specs/journeys для устранения дублирования setup-кода.
//
// Все flows работают с уже перехваченной фикстурой (см. lib/fixtures.js).

import { s } from './selectors'

/**
 * Ждёт готовности главной страницы: загрузка песен в IndexedDB и появление
 * поля поиска. По умолчанию переходит на '/'.
 */
export async function waitForHomeReady(page) {
  await page.goto('/')
  await page.waitForSelector(s.search.input, { timeout: 30000 })
  return page
}

/**
 * Открывает сайдбар кликом по гамбургеру. Предполагает, что на странице
 * есть кнопка меню (главная/песня/настройки).
 */
export async function openSidebar(page) {
  await page.click(s.navbar.menuBtn)
  await page.waitForSelector(s.sidebar.aside)
}

/** Закрывает сайдбар кликом по overlay. */
export async function closeSidebar(page) {
  await page.click(s.sidebar.overlay)
  await page.waitForSelector(s.sidebar.aside, { state: 'detached' })
}

/**
 * Переходит на страницу песни и ждёт загрузки заголовка.
 * @param {number} n номер песни
 */
export async function gotoSong(page, n) {
  await page.goto(`/song/${n}`)
  await page.waitForSelector(s.song.title, { timeout: 30000 })
}

/**
 * Открывает goto-popover «Перейти к песне» на странице песни.
 * Ожидает, что страница песни уже загружена.
 */
export async function openGotoPopover(page) {
  await page.click(s.navbar.gotoBtn)
  await page.waitForSelector(s.goto.overlay)
}

/** Закрывает goto-popover кликом по overlay. */
export async function closeGotoPopover(page) {
  await page.locator(s.goto.overlay).click({ position: { x: 5, y: 5 } })
  await page.waitForSelector(s.goto.overlay, { state: 'detached' })
}

/**
 * Создаёт подборку со страницы песни и возвращает её имя.
 * @param {import('@playwright/test').Page} page
 * @param {number} songNumber
 * @param {string} name имя подборки
 */
export async function createCollectionFromSong(page, songNumber, name) {
  await gotoSong(page, songNumber)
  await page.click(s.chips.chipAdd)
  await page.waitForSelector(s.popup.overlay)
  await page.fill(s.popup.input, name)
  await page.click(s.popup.createBtn)
  await page.waitForSelector(s.popup.overlay, { state: 'detached' })
  // Ждём появления чипа.
  await page.waitForSelector(`${s.chips.chip}:has-text("${name}")`)
  return name
}

/**
 * Переходит на страницу только что созданной подборки (по имени чипа).
 * Возвращает URL коллекции.
 */
export async function openCollectionByName(page, name) {
  await page.locator(`${s.chips.chip}:has-text("${name}")`).click()
  await page.waitForURL(/\/collections\/\d+$/)
  return page.url()
}

/**
 * Добавляет песню в «Избранное», если её там ещё нет.
 * Возвращает true, если состояние изменилось.
 */
export async function ensureFavorite(page, songNumber) {
  await gotoSong(page, songNumber)
  const star = page.locator(s.navbar.favoriteStar)
  const isActive = await star.evaluate((el) => el.classList.contains('active'))
  if (!isActive) {
    await star.click()
    await page.waitForSelector(s.navbar.favoriteStarActive)
    return true
  }
  return false
}

/**
 * Уникальное имя подборки для тестов (timestamp-based).
 * Гарантирует изоляцию между прогонами.
 */
export function uniqueCollectionName(prefix = 'E2E') {
  return `${prefix} ${Date.now()}`
}
