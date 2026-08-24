/**
 * Ссылки, которыми делятся: сборка адреса и подписи.
 *
 * Две разные вещи под одним словом «поделиться»:
 *
 * - **Песня** — обычный адрес приложения (`/song/115?v=1`). Открывается у
 *   любого, ничего импортировать не нужно.
 * - **Подборка** — адрес страницы импорта с payload во фрагменте
 *   (`/collections/import#<data>`, см. `lib/collectionShare.js`). Фрагмент не
 *   уходит на сервер, поэтому серверного ограничения длины нет.
 *
 * Здесь только чистые функции: сам вызов `navigator.share` и работа с буфером
 * обмена — в `composables/useShare.js`.
 */

/** Маршрут страницы импорта подборки (пункт 4.4 дорожной карты). */
export const IMPORT_ROUTE = '/collections/import'

/**
 * Склеивает origin и путь, уже разрешённый роутером.
 *
 * Роутер отдаёт путь вместе с `app.baseURL` (`/nuxt-songs-app/song/115`), и
 * ошибиться можно только на стыке: и origin, и путь несут свой слеш.
 *
 * @param {string} origin `https://example.org`
 * @param {string} href путь от корня сайта
 */
export const joinUrl = (origin, href) => {
    const left = String(origin ?? '').replace(/\/+$/, '')
    const right = String(href ?? '')

    if (!right) return left
    return `${left}/${right.replace(/^\/+/, '')}`
}

/**
 * Путь к песне с учётом выбранного варианта.
 *
 * Нулевой вариант в адрес не пишется: он подразумевается, а короткая ссылка
 * читается человеком в мессенджере.
 */
export const songPath = (number, variantIndex = 0) => {
    const path = `/song/${number}`
    const variant = Number(variantIndex)

    return Number.isInteger(variant) && variant > 0 ? `${path}?v=${variant}` : path
}

/**
 * Подпись к ссылке на песню.
 *
 * Номер идёт первым: в сборнике песню ищут по номеру, и в списке пересланных
 * сообщений он опознаётся быстрее названия.
 */
export const songShareTitle = ({ number, title, variantLabel = '' } = {}) => {
    const base = `№ ${number}. ${String(title ?? '').trim()}`.trim()
    const label = String(variantLabel ?? '').trim()

    return label ? `${base} (${label})` : base
}

/**
 * Порог длины всего адреса ссылки на подборку.
 *
 * Консервативный: фрагмент на сервер не уходит, и браузеры держат заметно
 * больше. Режут ссылку не браузеры, а мессенджеры и превью-парсеры — а сколько
 * именно они держат, каждый решает сам, и узнать это можно только по жалобе
 * получателя, у которого «ссылка не открывается».
 */
export const SHARE_URL_LIMIT = 2000

/**
 * Сколько символов остаётся под данные подборки при этом базовом адресе.
 *
 * Считать приходится у вызывающего: базовый адрес зависит от домена и от
 * `app.baseURL`, а на GitHub Pages приложение живёт не в корне. Отрицательного
 * бюджета не бывает — если базовый адрес сам длиннее порога, остаётся ноль, и
 * ссылка честно не влезает.
 *
 * @param {string} baseUrl — адрес страницы импорта вместе с `#`
 * @param {number} [limit]
 * @returns {number}
 */
export const shareDataBudget = (baseUrl, limit = SHARE_URL_LIMIT) => {
    const max = Number(limit)
    if (!Number.isFinite(max) || max <= 0) return 0

    return Math.max(0, Math.trunc(max) - String(baseUrl ?? '').length)
}

/** Подпись к ссылке на подборку. */
export const collectionShareTitle = (name) => `Подборка «${String(name ?? '').trim()}»`

/**
 * Как делиться в этом браузере.
 *
 * `share` — системная шторка (телефон, установленное PWA). `copy` — буфер
 * обмена: на desktop Web Share обычно нет. `none` — ни того, ни другого;
 * буфер требует защищённого контекста, и по http кнопка бесполезна, поэтому её
 * лучше не показывать вовсе, чем показывать неработающей.
 *
 * @param {object} nav объект вида `navigator`
 * @returns {'share'|'copy'|'none'}
 */
export const shareMethod = (nav) => {
    if (typeof nav?.share === 'function') return 'share'
    if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') return 'copy'

    return 'none'
}
