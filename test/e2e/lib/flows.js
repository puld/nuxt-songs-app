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
 * Включает показ аккордов до загрузки страницы.
 *
 * Условие показа — геттер `chordsVisible`, то есть **оба** флага: аккорды
 * закрыты режимом разработчика, и одного `showChords` мало. Через
 * `addInitScript`, а не кликами по настройкам: тумблер проверяется своим
 * тестом в `settings.spec.js`, а здесь аккорды — предусловие, а не предмет.
 *
 * Вызывать до `page.goto` — иначе приложение прочитает настройки прежними.
 */
export async function enableChords(page, { bassHidden = false } = {}) {
  await page.addInitScript((hideBass) => {
    window.localStorage.setItem('devMode', 'true')
    window.localStorage.setItem('showChords', 'true')
    window.localStorage.setItem('hideChordBass', String(hideBass))
  }, bassHidden)
}

/**
 * Ждёт, пока подобранная тональность действительно ляжет в IndexedDB.
 *
 * Панель обновляет подпись синхронно, а запись в `songSettings` идёт отдельной
 * транзакцией — и `page.goto` сразу после клика рвёт документ раньше, чем она
 * завершится. Пользователю это почти не грозит (между тапом и переходом у него
 * не миллисекунды), но тест без ожидания флакует. Ждать факт записи, а не
 * фиксированную паузу: пауза либо мала на медленной машине, либо тратится зря.
 */
export async function waitForStoredTranspose(page, songNumber, expected) {
  await page.waitForFunction(
    ([number, value]) =>
      new Promise((resolve) => {
        const request = indexedDB.open('SongsDB')
        request.onsuccess = () => {
          const db = request.result
          const get = db.transaction('songSettings').objectStore('songSettings').get(number)
          get.onsuccess = () => {
            db.close()
            resolve((get.result?.transpose ?? 0) === value)
          }
          get.onerror = () => {
            db.close()
            resolve(false)
          }
        }
        request.onerror = () => resolve(false)
      }),
    [songNumber, expected]
  )
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

/**
 * Эмулирует событие beforeinstallprompt — браузер (Chromium в Playwright)
 * не эмитит его автоматически, поэтому для теста install-flow нужно диспатчить
 * вручную. Возвращает результат prompt() если вызвать install.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} [opts.outcome='accepted'] — исход диалога ('accepted'|'dismissed')
 * @returns {Promise<{promptCalled: Promise<boolean>}>} — промис, зарезолвится true,
 *   если install() вызвал deferredPrompt.prompt()
 */
export async function dispatchBeforeInstallPrompt(page, opts = {}) {
  const outcome = opts.outcome || 'accepted'
  await page.evaluate(async (outcome) => {
    const evt = new Event('beforeinstallprompt', { cancelable: true })
    evt.prompt = () => { window.__promptCalled = true; return Promise.resolve() }
    evt.userChoice = Promise.resolve({ outcome, platform: 'web' })
    window.dispatchEvent(evt)
    // ждём реактивный апдейт
    await new Promise((r) => setTimeout(r, 50))
  }, outcome)
}

/** Сбрасывает маркер вызова prompt() (ставится dispatchBeforeInstallPrompt). */
export async function resetPromptCalledMarker(page) {
  await page.evaluate(() => { delete window.__promptCalled })
}

/** Возвращает true, если install() вызвал deferredPrompt.prompt(). */
export async function wasPromptCalled(page) {
  return page.evaluate(() => !!window.__promptCalled)
}

/**
 * Создаёт подборки прямо в IndexedDB, минуя UI.
 *
 * Через страницу песни каждая подборка — это переход, диалог и ввод имени;
 * для длинного списка (проверки скролла) это минуты на пустом месте.
 * Возвращает на главную готовой к открытию сайдбара.
 */
export async function seedCollections(page, count) {
  await page.evaluate(async (n) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('SongsDB')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    await new Promise((resolve, reject) => {
      const tx = db.transaction('collections', 'readwrite')
      const store = tx.objectStore('collections')
      for (let i = 1; i <= n; i++) {
        const date = new Date(Date.UTC(2020, 0, i)).toISOString()
        store.add({ name: `Список ${i}`, createdAt: date, updatedAt: date, order: i })
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  }, count)

  await page.reload()
}

/**
 * Заводит подборку сразу в IndexedDB и возвращает её id.
 *
 * Нужен там, где имя или состав не набрать руками: ступени деградации ссылки
 * упираются в длину payload, а через попап создания пришлось бы вбивать
 * несколько тысяч символов и потом искать чип с таким именем.
 */
export async function seedCollectionWithSongs(page, name, songNumbers) {
  const id = await page.evaluate(async ({ collectionName, numbers }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('SongsDB')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const now = new Date().toISOString()
    const collectionId = await new Promise((resolve, reject) => {
      const tx = db.transaction('collections', 'readwrite')
      const request = tx.objectStore('collections')
        .add({ name: collectionName, createdAt: now, updatedAt: now, order: 999 })
      request.onsuccess = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
    })

    await new Promise((resolve, reject) => {
      const tx = db.transaction('songCollections', 'readwrite')
      const store = tx.objectStore('songCollections')
      numbers.forEach((songNumber) => {
        store.add({ collectionId, songNumber, variantIndex: 0, addedAt: now })
      })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()
    return collectionId
  }, { collectionName: name, numbers: songNumbers })

  return id
}

/**
 * Подменяет `navigator.share` перехватчиком.
 *
 * Обязательно для любого теста, который жмёт «Поделиться»: desktop-Chromium
 * Web Share заявляет, но системной шторки в автоматизации нет — настоящий вызов
 * просто зависает, и тест падает по таймауту, а не по существу.
 */
export async function stubWebShare(page) {
  await page.addInitScript(() => {
    window.__shareCalls = []
    Navigator.prototype.share = function (data) {
      window.__shareCalls.push(data)
      return Promise.resolve()
    }
  })
}

/** Убирает Web Share целиком — остаётся ветка копирования в буфер. */
export async function removeWebShare(page) {
  await page.addInitScript(() => {
    delete Navigator.prototype.share
  })
}

/** Перехваченные вызовы `navigator.share`. */
export async function getShareCalls(page) {
  return page.evaluate(() => window.__shareCalls || [])
}

/**
 * Собирает данные для фрагмента ссылки на подборку (формат `1`, без сжатия).
 *
 * Тест кодирует payload сам, а не через `lib/collectionShare.js`: так ссылку
 * можно собрать с любой версией базы — иначе ветку «база получателя устарела»
 * не проверить, ведь приложение всегда пишет актуальную версию.
 */
export async function buildShareData(page, { name, songsVersion = 1, songs = [] }) {
  return page.evaluate(({ name, songsVersion, songs }) => {
    const list = songs
      .map((s) => (s.variantIndex ? `${s.songNumber}.${s.variantIndex}` : String(s.songNumber)))
      .join(',')
    const bytes = new TextEncoder().encode(['1', name, String(songsVersion), list].join('\n'))

    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }, { name, songsVersion, songs })
}

/**
 * То же, но без браузера — когда страница импорта должна быть первой записью
 * истории вкладки: любой предварительный `goto` даёт кнопке «Назад» чужую
 * страницу, куда можно вернуться, и баг с уходом из приложения не воспроизводится.
 */
export function buildShareDataOffline({ name, songsVersion = 1, songs = [] }) {
  const list = songs
    .map((s) => (s.variantIndex ? `${s.songNumber}.${s.variantIndex}` : String(s.songNumber)))
    .join(',')

  return Buffer.from(['1', name, String(songsVersion), list].join('\n')).toString('base64url')
}

/** Открывает страницу приёма подборки с готовым фрагментом. */
export async function openImportLink(page, data) {
  await page.goto(`/collections/import#${data}`)
  await page.waitForSelector(s.collectionImport.page)
}
