import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Линейный рост ширины колонки текста при увеличении viewport.
//
// Раньше: процентные брейкпоинты (90% → 83.33% → 66.67% → 50%) давали
// скачки ширины ВНИЗ при переходе через 480/640/768/1024px.
// Теперь: width: 100% + max-width → ширина линейно растёт до максимума,
// потом фиксируется. Скачков быть не должно.
//
// Проверяем с мелким шагом вокруг ключевых точек:
//   560px = 35rem (max-width крупного шрифта)
//   640px = 40rem (max-width среднего шрифта)
//   720px = 45rem (max-width мелкого шрифта)
//   768px = брейкпоинт позиционирования «Припев:»
//  1024px = бывший брейкпоинт ширины (убран)

const VIEWPORTS = [
  320, 360, 375, 390, 414,        // мобильные
  480, 520, 560, 580, 600,        // вокруг 560 (large max)
  620, 640, 660, 680, 700,        // вокруг 640 (medium max)
  720, 740, 760, 768, 780,        // вокруг 720 (small max) и 768 (chorus)
  800, 900, 1000, 1023, 1024,     // вокруг 1024 (бывший брейкпоинт)
  1100, 1200, 1280, 1366, 1440,   // десктопы
  1536, 1920,                      // крупные десктопы
]

// Ожидаемые max-width в пикселях (root font-size = 16px)
const MAX_WIDTHS = {
  small: 720,  // 45rem
  medium: 640, // 40rem
  large: 560,  // 35rem
}

async function setFontSize(page, size) {
  await page.goto('/settings')
  if (size === 'small') {
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Меньше' }).click()
  } else if (size === 'large') {
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Больше' }).click()
  }
  // medium — по умолчанию
}

async function measureWidths(page, selector) {
  const widths = []
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp, height: 900 })
    await page.waitForTimeout(100)
    const w = await page.locator(selector).evaluate(
      (el) => Math.round(el.getBoundingClientRect().width)
    )
    widths.push(w)
  }
  return widths
}

function assertMonotonic(widths, label) {
  for (let i = 1; i < widths.length; i++) {
    expect(
      widths[i],
      `${label}: viewport ${VIEWPORTS[i]}px → ширина ${widths[i]}px < ${widths[i - 1]}px при ${VIEWPORTS[i - 1]}px`
    ).toBeGreaterThanOrEqual(widths[i - 1])
  }
}

function assertWithinMax(widths, maxPx, label) {
  for (let i = 0; i < widths.length; i++) {
    expect(
      widths[i],
      `${label}: viewport ${VIEWPORTS[i]}px → ширина ${widths[i]}px > max ${maxPx}px`
    ).toBeLessThanOrEqual(maxPx)
  }
}

test.describe('Линейный рост ширины колонки текста', () => {
  for (const fontSize of ['small', 'medium', 'large']) {
    test(`${fontSize}: .song-content-wrapper монотонно растёт без скачков`, async ({ page }) => {
      await setFontSize(page, fontSize)
      await gotoSong(page, SONGS.ONE.n)

      const widths = await measureWidths(page, s.song.contentWrapper)

      // Ширина монотонно не убывает при росте viewport
      assertMonotonic(widths, `${fontSize} wrapper`)

      // Ширина не превышает max-width
      assertWithinMax(widths, MAX_WIDTHS[fontSize], `${fontSize} wrapper`)
    })

    test(`${fontSize}: .song-title-row монотонно растёт без скачков`, async ({ page }) => {
      await setFontSize(page, fontSize)
      await gotoSong(page, SONGS.ONE.n)

      const widths = await measureWidths(page, s.song.titleRow)

      assertMonotonic(widths, `${fontSize} title-row`)
      assertWithinMax(widths, MAX_WIDTHS[fontSize], `${fontSize} title-row`)
    })
  }

  test('крупный шрифт: «Припев:» на отдельной строке до 768px, inline с 768px', async ({ page }) => {
    await setFontSize(page, 'large')
    await gotoSong(page, SONGS.ONE.n)

    const chorusLabel = page.locator(s.song.chorusLabel).first()
    if ((await chorusLabel.count()) === 0) {
      test.skip(true, 'Песня без припева — нечего проверять')
      return
    }

    // Ниже 768px: position: static («Припев:» на отдельной строке)
    for (const vp of [480, 600, 640, 720, 767]) {
      await page.setViewportSize({ width: vp, height: 900 })
      await page.waitForTimeout(100)
      await expect(
        chorusLabel,
        `viewport ${vp}px: «Припев:» должно быть static (на отдельной строке)`
      ).toHaveCSS('position', 'static')
    }

    // 768px и выше: position: absolute (inline)
    for (const vp of [768, 900, 1024, 1280]) {
      await page.setViewportSize({ width: vp, height: 900 })
      await page.waitForTimeout(100)
      await expect(
        chorusLabel,
        `viewport ${vp}px: «Припев:» должно быть absolute (inline)`
      ).toHaveCSS('position', 'absolute')
    }
  })
})
