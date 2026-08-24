import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import {
  waitForHomeReady,
  createCollectionFromSong,
  openCollectionByName,
  openSidebar,
  uniqueCollectionName,
  stubWebShare,
  getShareCalls,
  buildShareData,
  openImportLink
} from '../lib/flows'

// Приём подборки по ссылке: `/collections/import#<data>`.
//
// Данные в фрагменте, поэтому ссылка проверяется целиком на клиенте: разбор,
// сверка версии базы, план сохранения и сами кнопки.

const withDevMode = async (page) => {
  await page.addInitScript(() => localStorage.setItem('devMode', 'true'))
}

test.describe('Подборка по ссылке: гейт режима разработчика', () => {
  test('без devMode — заглушка вместо разбора ссылки', async ({ page }) => {
    // Фрагмент валидный: заглушку показывает гейт, а не ошибка разбора.
    await page.goto('/')
    const data = await buildShareData(page, { name: 'Гости', songs: [{ songNumber: SONGS.ONE.n }] })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.stub)).toContainText('Экспериментальный экран')
    await expect(page.locator(s.collectionImport.saveBtn)).toHaveCount(0)
  })
})

test.describe('Подборка по ссылке: разбор', () => {
  test.beforeEach(async ({ page }) => { await withDevMode(page) })

  test('состав подборки виден до сохранения', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, {
      name: 'Воскресное',
      songs: [{ songNumber: SONGS.ONE.n }, { songNumber: SONGS.TWO.n }]
    })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.title)).toHaveText('Воскресное')
    await expect(page.locator(s.collectionImport.subtitle)).toContainText('2 песни')
    await expect(page.locator(s.collectionImport.song)).toHaveCount(2)
    await expect(page.locator(s.collectionImport.song).first()).toContainText(SONGS.ONE.title)
  })

  test('песня не из базы получателя помечена и в подборку не уходит', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, {
      name: 'С лишней песней',
      songs: [{ songNumber: SONGS.ONE.n }, { songNumber: SONGS.NONEXISTENT }]
    })

    await openImportLink(page, data)

    // В списке она видна — получателю важно знать, что прислали больше.
    await expect(page.locator(s.collectionImport.song)).toHaveCount(2)
    await expect(page.locator(s.collectionImport.warning)).toContainText('не найдено в вашей базе')
    // А в счётчике сохраняемых — уже нет.
    await expect(page.locator(s.collectionImport.subtitle)).toContainText('1 песня')
  })

  test('вариант, которого нет у песни, прижимается к основному', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, {
      name: 'Чужие варианты',
      songs: [{ songNumber: SONGS.ONE.n, variantIndex: 5 }]
    })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.warning)).toContainText('нет присланного варианта')
    await expect(page.locator(s.collectionImport.songNote)).toHaveText('основной вариант')
  })

  test('испорченная ссылка объясняет причину, а не показывает пустоту', async ({ page }) => {
    await page.goto('/')
    await openImportLink(page, 'broken-payload')

    await expect(page.locator(s.collectionImport.error)).toContainText('Ссылка испорчена')
    await expect(page.locator(s.collectionImport.saveBtn)).toHaveCount(0)
  })

  test('ссылка без данных — отдельное сообщение', async ({ page }) => {
    await page.goto('/collections/import')

    await expect(page.locator(s.collectionImport.error)).toContainText('нет данных подборки')
  })

  test('вторая ссылка без перезагрузки перечитывается', async ({ page }) => {
    // Тап по второй ссылке в открытом приложении меняет только фрагмент —
    // документ не перезагружается, и без реакции на hash получатель сохранил бы
    // не ту подборку.
    await page.goto('/')
    const first = await buildShareData(page, { name: 'Первая', songs: [{ songNumber: SONGS.ONE.n }] })
    const second = await buildShareData(page, {
      name: 'Вторая',
      songs: [{ songNumber: SONGS.ONE.n }, { songNumber: SONGS.TWO.n }]
    })

    await openImportLink(page, first)
    await expect(page.locator(s.collectionImport.title)).toHaveText('Первая')

    await page.evaluate((data) => { window.location.hash = data }, second)

    await expect(page.locator(s.collectionImport.title)).toHaveText('Вторая')
    await expect(page.locator(s.collectionImport.song)).toHaveCount(2)
  })
})

test.describe('Подборка по ссылке: версия базы песен', () => {
  test.beforeEach(async ({ page }) => { await withDevMode(page) })

  test('база получателя старше — импорт остановлен с предложением обновить', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, {
      name: 'Из будущей базы',
      songsVersion: 99,
      songs: [{ songNumber: SONGS.ONE.n }]
    })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.error)).toContainText('База песен устарела')
    await expect(page.locator(s.collectionImport.updateBtn)).toBeVisible()
    await expect(page.locator(s.collectionImport.saveBtn)).toHaveCount(0)
  })

  test('база получателя новее — импорт идёт с предупреждением о вариантах', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, {
      name: 'Из старой базы',
      songsVersion: 0,
      songs: [{ songNumber: SONGS.ONE.n }]
    })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.warning)).toContainText('более старой базе')
    await expect(page.locator(s.collectionImport.saveBtn)).toBeVisible()
  })
})

test.describe('Подборка по ссылке: сохранение', () => {
  test.beforeEach(async ({ page }) => { await withDevMode(page) })

  test('новая подборка появляется в сайдбаре с песнями из ссылки', async ({ page }) => {
    await page.goto('/')
    const name = uniqueCollectionName('Импорт')
    const data = await buildShareData(page, {
      name,
      songs: [{ songNumber: SONGS.ONE.n }, { songNumber: SONGS.TWO.n }]
    })

    await openImportLink(page, data)
    await page.click(s.collectionImport.saveBtn)

    await expect(page.locator(s.collectionImport.saved)).toContainText('Сохранено')
    await page.locator(`${s.collectionImport.saved} a`).click()

    await page.waitForURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(2)

    await waitForHomeReady(page)
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionLink, { hasText: name })).toBeVisible()
  })

  test('совпадение имени: можно добавить в свою подборку, дубликаты не задваиваются', async ({ page }) => {
    const name = uniqueCollectionName('Совпадение')
    await createCollectionFromSong(page, SONGS.ONE.n, name)

    // Ссылка несёт ту же песню и ещё одну: слияние должно добавить только вторую.
    const data = await buildShareData(page, {
      name,
      songs: [{ songNumber: SONGS.ONE.n }, { songNumber: SONGS.TWO.n }]
    })

    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.sameName)).toContainText(name)
    await page.click(s.collectionImport.mergeBtn)

    await expect(page.locator(s.collectionImport.saved)).toContainText('Сохранено')
    await page.locator(`${s.collectionImport.saved} a`).click()

    await page.waitForURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(2)

    // Второй подборки с тем же именем не появилось.
    await waitForHomeReady(page)
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionLink, { hasText: name })).toHaveCount(1)
  })

  test('сохранение отдельно даёт имя со свободным номером', async ({ page }) => {
    const name = uniqueCollectionName('Отдельно')
    await createCollectionFromSong(page, SONGS.ONE.n, name)

    const data = await buildShareData(page, { name, songs: [{ songNumber: SONGS.TWO.n }] })
    await openImportLink(page, data)

    await expect(page.locator(s.collectionImport.saveBtn)).toContainText(`${name} (2)`)
    await page.click(s.collectionImport.saveBtn)
    await expect(page.locator(s.collectionImport.saved)).toBeVisible()

    await waitForHomeReady(page)
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionLink, { hasText: `${name} (2)` })).toBeVisible()
    // Исходная подборка не тронута: в ней осталась своя песня.
    // Целимся в само название: в ссылке рядом стоит счётчик песен, и «$» по
    // тексту ссылки не сходится.
    await page.locator(s.sidebar.collectionName)
      .filter({ hasText: new RegExp(`^${name}$`) }).click()
    await page.waitForURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(1)
  })
})

test.describe('Подборка по ссылке: имя подборки', () => {
  test.beforeEach(async ({ page }) => { await withDevMode(page) })

  test('имя из ссылки подставлено в поле и правится перед сохранением', async ({ page }) => {
    await page.goto('/')
    const sent = uniqueCollectionName('Присланное')
    const own = uniqueCollectionName('Своё имя')
    const data = await buildShareData(page, { name: sent, songs: [{ songNumber: SONGS.ONE.n }] })

    await openImportLink(page, data)
    await expect(page.locator(s.collectionImport.nameInput)).toHaveValue(sent)

    await page.fill(s.collectionImport.nameInput, own)
    await page.click(s.collectionImport.saveBtn)

    await expect(page.locator(s.collectionImport.saved)).toContainText(own)

    await waitForHomeReady(page)
    await openSidebar(page)
    await expect(page.locator(s.sidebar.collectionLink, { hasText: own })).toBeVisible()
    // Под присланным именем ничего не создалось.
    await expect(page.locator(s.sidebar.collectionLink, { hasText: sent })).toHaveCount(0)
  })

  test('введённое имя своей подборки включает слияние', async ({ page }) => {
    // Совпадение считается от поля, а не от имени в ссылке: получатель может
    // сам решить, что присланное — продолжение его подборки.
    const own = uniqueCollectionName('Уже есть')
    await createCollectionFromSong(page, SONGS.ONE.n, own)

    const data = await buildShareData(page, {
      name: uniqueCollectionName('Чужое'),
      songs: [{ songNumber: SONGS.TWO.n }]
    })
    await openImportLink(page, data)
    await expect(page.locator(s.collectionImport.mergeBtn)).toHaveCount(0)

    await page.fill(s.collectionImport.nameInput, own)

    await expect(page.locator(s.collectionImport.sameName)).toContainText(own)
    await page.click(s.collectionImport.mergeBtn)

    await expect(page.locator(s.collectionImport.saved)).toContainText(own)
    await page.locator(`${s.collectionImport.saved} a`).click()

    await page.waitForURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(2)
  })

  test('поле имени по ширине колонки, а не шире списка песен', async ({ page }) => {
    // У input свой `box-sizing`, и при `width: 100%` паддинги с рамкой
    // выталкивали поле за колонку — заметно только глазами, поэтому сторож.
    await page.goto('/')
    const data = await buildShareData(page, { name: 'Ширина', songs: [{ songNumber: SONGS.ONE.n }] })

    await openImportLink(page, data)

    const list = await page.locator(s.collection.songsList).first().boundingBox()
    const input = await page.locator(s.collectionImport.nameInput).boundingBox()

    expect(Math.abs(input.width - list.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(input.x - list.x)).toBeLessThanOrEqual(1)
  })

  test('пустое имя не даёт сохранить', async ({ page }) => {
    await page.goto('/')
    const data = await buildShareData(page, { name: 'Без имени', songs: [{ songNumber: SONGS.ONE.n }] })

    await openImportLink(page, data)
    await page.fill(s.collectionImport.nameInput, '   ')

    await expect(page.locator(s.collectionImport.nameHint)).toBeVisible()
    await expect(page.locator(s.collectionImport.saveBtn)).toBeDisabled()
  })
})

test.describe('Подборка по ссылке: сквозной путь', () => {
  test('поделиться подборкой → открыть ссылку → сохранить у получателя', async ({ page }) => {
    await withDevMode(page)
    await stubWebShare(page)

    const name = uniqueCollectionName('Сквозняк')
    await createCollectionFromSong(page, SONGS.ONE.n, name)
    await openCollectionByName(page, name)

    await page.click(s.share.button)
    const calls = await getShareCalls(page)
    const data = calls[0].url.split('#')[1]

    // Получатель — тот же браузер, но подборку сохраняем под свободным именем:
    // проверяем именно приём ссылки, а не слияние.
    await openImportLink(page, data)
    await expect(page.locator(s.collectionImport.title)).toHaveText(name)
    await page.click(s.collectionImport.saveBtn)

    await expect(page.locator(s.collectionImport.saved)).toBeVisible()
    await page.locator(`${s.collectionImport.saved} a`).click()
    await page.waitForURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(1)
    await expect(page.locator(s.collection.songItem).first()).toContainText(SONGS.ONE.title)
  })
})
