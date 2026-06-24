import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, uniqueCollectionName } from '../lib/flows'

// Джорни: пользователь создаёт подборку, добавляет в неё две песни
// с разных страниц, открывает подборку, видит список, входит в режим
// редактирования и удаляет одну песню.

test.describe('Джорни: собрать подборку', () => {
  test('создать подборку + добавить 2 песни + редактировать', async ({ page }) => {
    const name = uniqueCollectionName('Сборная')

    // 1. Со страницы песни #1 создаём подборку и добавляем.
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)
    await page.fill(s.popup.input, name)
    await page.click(s.popup.createBtn)
    await expect(page.locator(`${s.chips.chip}:has-text("${name}")`)).toBeVisible()

    // 2. Переходим к песне #2 и добавляем в ту же подборку через попап.
    await page.click(s.navbar.nextBtn)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.TWO.n}$`))
    await page.click(s.chips.chipAdd)
    await expect(page.locator(s.popup.overlay)).toBeVisible()
    // В списке доступных подборок должна быть созданная.
    await expect(page.locator(`${s.popup.collectionItem}:has-text("${name}")`)).toBeVisible()
    await page.locator(`${s.popup.collectionItem}:has-text("${name}")`).click()
    await expect(page.locator(s.popup.overlay)).toHaveCount(0)
    // Чип подборки появился на странице песни #2.
    await expect(page.locator(`${s.chips.chip}:has-text("${name}")`)).toBeVisible()

    // 3. Открываем подборку через чип.
    await page.locator(`${s.chips.chip}:has-text("${name}")`).click()
    await expect(page).toHaveURL(/\/collections\/\d+$/)
    await expect(page.locator(s.navbar.title)).toHaveText(name)
    // В списке — обе песни.
    await expect(page.locator(s.collection.songItem)).toHaveCount(2)

    // 4. Входим в режим редактирования.
    await page.click(s.collection.editBtn)
    await expect(page.locator(s.collection.removeBtn)).toHaveCount(2)

    // 5. Удаляем первую песню (подтверждаем confirm).
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator(s.collection.removeBtn).first().click()
    await expect(page.locator(s.collection.songItem)).toHaveCount(1)
  })
})
