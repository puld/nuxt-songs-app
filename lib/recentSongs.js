/**
 * Список недавно открытых песен — чистые функции без Vue.
 *
 * Хранится в настройках (localStorage), а не в IndexedDB: список короткий,
 * подборок не касается и переживать eviction ему не нужно — потеря истории
 * просмотров ничего не стоит, в отличие от потери подборок.
 *
 * Наружу отдаётся только массив номеров: название и метку варианта страница
 * берёт из карты песен (`useSongsCache`), поэтому переименование песни в
 * обновлённой базе не оставляет в истории устаревший заголовок.
 */

/**
 * Сколько песен помнить.
 *
 * Список показывается на главной целиком, поэтому это не только предел
 * хранения, но и высота блока: длиннее — и он вытеснит подсказки за экран.
 */
export const RECENT_LIMIT = 5

/**
 * Номер песни как целое положительное число или null.
 *
 * Номер приходит и строкой (из `route.params`), и числом (из базы), а из
 * localStorage — вообще чем угодно.
 */
const toNumber = (value) => {
    const number = Number(value)

    return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * Приводит сохранённое значение к списку номеров.
 *
 * Значение читается из localStorage, где может оказаться что угодно: правка
 * руками, формат от будущей версии, обрезанный JSON. Без нормализации мусор
 * ушёл бы прямо в шаблон и дал бы пустые ссылки «Неизвестная песня».
 *
 * @param {*} value
 * @param {number} limit
 * @returns {number[]}
 */
export const normalizeRecent = (value, limit = RECENT_LIMIT) => {
    if (!Array.isArray(value)) return []

    const result = []
    for (const item of value) {
        const number = toNumber(item)
        if (number !== null && !result.includes(number)) result.push(number)
        if (result.length >= limit) break
    }

    return result
}

/**
 * Добавляет песню в начало списка.
 *
 * Повторное открытие той же песни не плодит записей, а поднимает её наверх:
 * список отвечает на вопрос «что я смотрел последним», а не «сколько раз».
 *
 * @param {*} list — текущее значение из хранилища (нормализуется здесь же)
 * @param {number|string} number
 * @param {number} limit
 * @returns {number[]} новый массив; исходный не мутируется
 */
export const addRecent = (list, number, limit = RECENT_LIMIT) => {
    const current = normalizeRecent(list, limit)
    const added = toNumber(number)

    if (added === null) return current

    return [added, ...current.filter((item) => item !== added)].slice(0, limit)
}
