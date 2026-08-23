/**
 * Смещение модального попапа, когда экранную клавиатуру уже видно.
 *
 * Попап центрируется по окну, но клавиатура накрывает нижнюю половину экрана
 * (`interactive-widget=overlays-content` в `nuxt.config.js`), поэтому
 * центрированный попап с полем ввода оказывается под ней. Считаем, на сколько
 * его сдвинуть к верху видимой области.
 */

/** Отступ от верхней границы видимой области, чтобы попап не прилипал к краю. */
export const POPUP_TOP_GAP = 16

/**
 * @param {number} viewportHeight - высота видимой области (`visualViewport.height`)
 * @param {number} popupHeight - высота попапа
 * @returns {number} отступ сверху в пикселях; 0 — попап помещается по центру
 */
export const calcPopupOffset = (viewportHeight, popupHeight) => {
    if (!viewportHeight || !popupHeight) return 0

    const centeredTop = viewportHeight / 2 - popupHeight / 2

    return Math.max(0, -centeredTop + POPUP_TOP_GAP)
}
