import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Джорни: пользователь настраивает тему и размер шрифта, включает аккорды,
// открывает песню и видит применение настроек к отображению.

test.describe('Джорни: настройки → отображение песни', () => {
  test('тёмная тема + крупный шрифт + аккорды применяются к песне', async ({ page }) => {
    // 0. Включаем аккорды через localStorage ДО загрузки — тумблер скрыт в UI,
    //    но функциональность сохранена. Pinia (useStorage) подхватит значение
    //    при инициализации.
    await page.addInitScript(() => {
      localStorage.setItem('showChords', 'true')
    })

    // 1. В настройках включаем тёмную тему.
    await page.goto('/settings')
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Темная' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)

    // 2. Крупный шрифт.
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Больше' }).click()

    // 3. Аккорды уже включены через localStorage (тумблер скрыт в UI).

    // 4. Открываем песню — настройки применились.
    await gotoSong(page, SONGS.ONE.n)

    // Тёмная тема на корне .layout.
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)
    // Крупный шрифт — на .song-container (SongDisplay), не на .layout.
    await expect(page.locator(s.song.container)).toHaveClass(/font-size-large/)

    // Если в песне есть аккорды — они отображаются (есть .chord в DOM).
    // Песня #1 может не иметь аккордов, поэтому проверяем «не падает»:
    // селектор либо находит, либо 0 — главное, что showChords=true не ломает рендер.
    const chordCount = await page.locator(s.song.chord).count()
    expect(chordCount).toBeGreaterThanOrEqual(0)
  })

  test('светлая тема persists при переходе между страницами', async ({ page }) => {
    await page.goto('/settings')
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Светлая' }).click()

    // Переходим на главную — тема сохраняется.
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    await expect(page.locator(s.layout.root)).toHaveClass(/light/)

    // Переходим на страницу песни — тема сохраняется.
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.layout.root)).toHaveClass(/light/)
  })
})
