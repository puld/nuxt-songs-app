import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import {
  openSidebar,
  closeSidebar,
  waitForHomeReady,
  createCollectionFromSong,
  uniqueCollectionName
} from '../lib/flows'

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

// Ручная сортировка подборок: кнопки «выше/ниже» и перетаскивание за ручку.
// Режим закрыт devMode, поэтому флаг ставится заранее.
test.describe('Сайдбар: порядок подборок', () => {
  /**
   * Создаёт подборки со страницы песни и возвращает на главную: гамбургер
   * есть только там, а сайдбар нужен уже с готовым списком.
   */
  const withCollections = async (page, ...names) => {
    await waitForHomeReady(page)
    for (const name of names) {
      await createCollectionFromSong(page, 1, name)
    }
    await waitForHomeReady(page)
    await openSidebar(page)
  }

  const enableDevMode = (page) =>
    page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))

  test('без devMode кнопки «Порядок» нет', async ({ page }) => {
    await withCollections(page, uniqueCollectionName('Один'), uniqueCollectionName('Два'))

    await expect(page.locator(s.sidebar.reorderToggle)).toHaveCount(0)
  })

  test('одна подборка — переставлять нечего, кнопки нет', async ({ page }) => {
    await enableDevMode(page)
    await withCollections(page, uniqueCollectionName('Единственная'))

    // В базе «Избранное» и одна пользовательская — двигать нечего.
    await expect(page.locator(s.sidebar.reorderToggle)).toHaveCount(0)
  })

  test('стрелка «ниже» меняет порядок, и он сохраняется после перезагрузки', async ({ page }) => {
    await enableDevMode(page)
    const first = uniqueCollectionName('Первая')
    const second = uniqueCollectionName('Вторая')
    await withCollections(page, first, second)

    const rows = page.locator(s.sidebar.collectionRow)
    await expect(rows.nth(1)).toContainText(first)

    await page.locator(s.sidebar.reorderToggle).click()
    await rows.nth(1).locator(s.sidebar.collectionDown).click()

    await expect(rows.nth(1)).toContainText(second)
    await expect(rows.nth(2)).toContainText(first)

    // Порядок должен лежать в базе, а не только на экране.
    await waitForHomeReady(page)
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionRow).nth(1)).toContainText(second)
  })

  test('«Избранное» закреплено первым: ни ручки, ни стрелок', async ({ page }) => {
    await enableDevMode(page)
    await withCollections(page, uniqueCollectionName('Первая'), uniqueCollectionName('Вторая'))
    await page.locator(s.sidebar.reorderToggle).click()

    const favorite = page.locator(s.sidebar.collectionRow).first()
    await expect(favorite).toContainText('Избранное')
    await expect(favorite.locator(s.sidebar.collectionHandle)).toHaveCount(0)
    await expect(favorite.locator(s.sidebar.collectionUp)).toHaveCount(0)

    // У первой пользовательской «выше» выключена — выше только «Избранное».
    await expect(page.locator(s.sidebar.collectionRow).nth(1).locator(s.sidebar.collectionUp))
      .toBeDisabled()
  })

  test('в режиме порядка тап по подборке не открывает её', async ({ page }) => {
    await enableDevMode(page)
    await withCollections(page, uniqueCollectionName('Первая'), uniqueCollectionName('Вторая'))
    await page.locator(s.sidebar.reorderToggle).click()

    // force: ссылка сама отключает pointer-events, обычный клик Playwright не
    // пропустил бы — проверяем именно то, что перехода не происходит.
    await page.locator(s.sidebar.collectionLink).nth(1).click({ force: true })

    await expect(page.locator(s.sidebar.aside)).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('перетаскивание за ручку переставляет подборку', async ({ page }) => {
    await enableDevMode(page)
    const first = uniqueCollectionName('Первая')
    const second = uniqueCollectionName('Вторая')
    await withCollections(page, first, second)
    await page.locator(s.sidebar.reorderToggle).click()

    const rows = page.locator(s.sidebar.collectionRow)
    const handle = rows.nth(1).locator(s.sidebar.collectionHandle)
    const box = await handle.boundingBox()
    const rowHeight = (await rows.nth(1).boundingBox()).height

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + rowHeight, { steps: 5 })
    await page.mouse.up()

    await expect(rows.nth(1)).toContainText(second)
    await expect(rows.nth(2)).toContainText(first)
  })

  /** Смещение и переход каждой строки: transform в матрице, m42 — сдвиг по Y. */
  const rowTransforms = (rows) => rows.evaluateAll(els => els.map(el => {
    const style = getComputedStyle(el)
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? '' : style.transform)

    return { y: Math.round(matrix.m42), transition: style.transitionDuration }
  }))

  test('при перетаскивании сосед расступается, а после отпускания смещения сняты', async ({ page }) => {
    await enableDevMode(page)
    const first = uniqueCollectionName('Первая')
    const second = uniqueCollectionName('Вторая')
    await withCollections(page, first, second)
    await page.locator(s.sidebar.reorderToggle).click()

    const rows = page.locator(s.sidebar.collectionRow)
    const handle = rows.nth(1).locator(s.sidebar.collectionHandle)
    const box = await handle.boundingBox()
    const rowHeight = Math.round((await rows.nth(1).boundingBox()).height)

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + rowHeight, { steps: 5 })

    // Замер под удерживаемой мышью: состояние жеста не транзиентное.
    const during = await rowTransforms(rows)

    // Перетаскиваемая едет за курсором и без перехода — иначе она отставала бы.
    expect(during[1].y).toBeGreaterThan(rowHeight / 2)
    expect(during[1].transition).toBe('0s')
    // Сосед расступается плавно — на переходе, а не рывком.
    expect(during[2].transition).not.toBe('0s')
    // «Избранное» закреплено — оно не участвует в перестановке.
    expect(during[0].y).toBe(0)

    // Куда он уступает место, видно после доигрывания перехода: мышь всё ещё
    // удерживается, так что состояние жеста никуда не денется.
    await expect.poll(async () => Math.abs((await rowTransforms(rows))[2].y + rowHeight))
      .toBeLessThanOrEqual(1)

    await page.mouse.up()
    await expect(rows.nth(1)).toContainText(second)

    // Переход задаётся inline только на время жеста: когда состояние сброшено,
    // смещения снимаются вместе с ним — иначе строки «догоняли» бы новые места
    // уже после перестановки DOM, и это выглядело бы как рывок.
    await expect.poll(() => rowTransforms(rows))
      .toEqual([
        { y: 0, transition: '0s' },
        { y: 0, transition: '0s' },
        { y: 0, transition: '0s' }
      ])
  })

  test('строка, которую двигают стрелкой, едет поверх заменяемой', async ({ page }) => {
    await enableDevMode(page)
    const first = uniqueCollectionName('Первая')
    const second = uniqueCollectionName('Вторая')
    await withCollections(page, first, second)
    await page.locator(s.sidebar.reorderToggle).click()

    const rows = page.locator(s.sidebar.collectionRow)
    await rows.nth(1).locator(s.sidebar.collectionDown).click()

    // Пока строки меняются местами, нажатая поднята над соседкой: без этого
    // они разъезжались бы «сквозь» друг друга.
    await expect(rows.nth(1)).toHaveClass(/is-lifted/)

    // По окончании перестановки inline-стиль исчезает вместе с состоянием.
    await expect(rows.nth(1)).toContainText(second)
    await expect.poll(() => rowTransforms(rows))
      .toEqual([
        { y: 0, transition: '0s' },
        { y: 0, transition: '0s' },
        { y: 0, transition: '0s' }
      ])
  })

  test('«Готово» возвращает обычный вид со счётчиками', async ({ page }) => {
    await enableDevMode(page)
    await withCollections(page, uniqueCollectionName('Первая'), uniqueCollectionName('Вторая'))

    const toggle = page.locator(s.sidebar.reorderToggle)
    await toggle.click()
    await expect(page.locator(s.sidebar.collectionCount)).toHaveCount(0)

    await toggle.click()
    await expect(page.locator(s.sidebar.collectionHandle)).toHaveCount(0)
    await expect(page.locator(s.sidebar.collectionCount).first()).toBeVisible()
  })
})
