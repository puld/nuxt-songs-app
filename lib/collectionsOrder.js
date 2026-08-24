/**
 * Порядок подборок в сайдбаре — чистые функции без Vue.
 *
 * До появления поля `order` список строился по `createdAt`, то есть порядок
 * задавался тем, когда подборку создали. Это не совпадает с тем, как ей
 * пользуются: подборка на ближайшее воскресенье может быть создана последней,
 * а нужна первой.
 *
 * «Избранное» остаётся первым всегда и не переставляется: это системная
 * подборка, её нельзя удалить, и точка входа в неё должна быть предсказуемой.
 * Поэтому `order` расставляется по всему списку, но двигаются только
 * пользовательские подборки.
 */

/**
 * Числовой `order` или null.
 *
 * В базе поле появилось не сразу: у записей из старой базы его нет вовсе, а из
 * localStorage-копии может приехать что угодно.
 */
const toOrder = (value) => {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
}

/** Время создания в миллисекундах; отсутствующая дата уходит в конец. */
const toTime = (value) => {
    const time = new Date(value).getTime()

    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

/**
 * Сравнение пользовательских подборок: сначала по `order`, затем — для записей
 * без него — по дате создания, затем по `id`.
 *
 * Запись без `order` уходит в конец: она либо из старой базы (миграция
 * проставит порядок при следующем открытии), либо создана только что, а новая
 * подборка и должна оказаться внизу списка.
 */
const compareCollections = (a, b) => {
    const orderA = toOrder(a.order)
    const orderB = toOrder(b.order)

    if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB
    if (orderA !== null && orderB === null) return -1
    if (orderA === null && orderB !== null) return 1

    const timeDiff = toTime(a.createdAt) - toTime(b.createdAt)
    if (timeDiff !== 0) return timeDiff

    return Number(a.id) - Number(b.id)
}

/**
 * Список подборок в порядке показа: «Избранное» первым, остальные по `order`.
 *
 * @param {Array} collections
 * @returns {Array} новый массив; исходный не мутируется
 */
export const sortCollections = (collections) => {
    const list = Array.isArray(collections) ? [...collections] : []
    const favorites = list.filter((item) => item?.isFavorite).sort(compareCollections)
    const others = list.filter((item) => item && !item.isFavorite).sort(compareCollections)

    return [...favorites, ...others]
}

/**
 * `order` для новой подборки — следом за последней существующей.
 *
 * @param {Array} collections
 * @returns {number}
 */
export const nextOrder = (collections) => {
    const orders = (Array.isArray(collections) ? collections : [])
        .map((item) => toOrder(item?.order))
        .filter((value) => value !== null)

    return orders.length ? Math.max(...orders) + 1 : 0
}

/**
 * План записи `order`: только те подборки, у которых значение отличается от
 * позиции в итоговом списке.
 *
 * Пустой план означает «порядок уже верный» — на этом и держится
 * идемпотентность шага миграции и повторной перестановки.
 *
 * @param {Array} collections — в нужном порядке показа
 * @returns {Array<{id: number, order: number}>}
 */
export const orderPlan = (collections) => {
    const list = Array.isArray(collections) ? collections : []

    return list
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => item && toOrder(item.order) !== index)
        .map(({ item, index }) => ({ id: item.id, order: index }))
}

/**
 * План простановки `order` для существующей базы: порядок берётся текущий
 * («Избранное» первым, остальные по дате создания), меняется только поле.
 *
 * @param {Array} collections — как лежат в базе, в произвольном порядке
 * @returns {Array<{id: number, order: number}>}
 */
export const initialOrderPlan = (collections) => orderPlan(sortCollections(collections))

/**
 * Переставляет элемент внутри списка.
 *
 * Индексы вне диапазона list возвращают исходный порядок, а не бросают: кнопка
 * «вверх» у первой подборки и «вниз» у последней ничего не делают, и отдельной
 * проверки на стороне UI для этого не нужно.
 *
 * @param {Array} list
 * @param {number} from
 * @param {number} to
 * @returns {Array} новый массив; исходный не мутируется
 */
export const moveItem = (list, from, to) => {
    const result = Array.isArray(list) ? [...list] : []

    if (!Number.isInteger(from) || !Number.isInteger(to)) return result
    if (from < 0 || from >= result.length || to < 0 || to >= result.length || from === to) return result

    const [moved] = result.splice(from, 1)
    result.splice(to, 0, moved)

    return result
}

/**
 * Целевой индекс при перетаскивании: смещение в пикселях переводится в шаг по
 * строкам списка.
 *
 * Строки в сайдбаре одной высоты, поэтому позиция считается делением, а не
 * измерением каждой строки: пока палец держит ручку, обращаться к геометрии
 * DOM на каждое движение незачем. Округление к ближайшему означает «строка
 * встаёт на новое место, когда прошла половину соседней» — иначе перестановка
 * ощущается запаздывающей.
 *
 * @param {number} from — откуда тянут
 * @param {number} deltaY — смещение указателя от начала перетаскивания, px
 * @param {number} rowHeight — высота строки списка, px
 * @param {number} count — сколько строк в списке
 * @returns {number} индекс в пределах списка
 */
export const dropIndex = (from, deltaY, rowHeight, count) => {
    if (!Number.isInteger(from) || !Number.isInteger(count) || count <= 0) return 0
    if (!Number.isFinite(deltaY) || !Number.isFinite(rowHeight) || rowHeight <= 0) {
        return Math.min(Math.max(from, 0), count - 1)
    }

    // Округление симметричное: `Math.round` округляет к плюс бесконечности, то
    // есть ровно на половине строки вниз шаг уже происходит, а вверх ещё нет —
    // на ощупь это выглядит как разная чувствительность в две стороны.
    const rows = deltaY / rowHeight
    const target = from + Math.sign(rows) * Math.round(Math.abs(rows))

    return Math.min(Math.max(target, 0), count - 1)
}

/**
 * На сколько строк сдвинуть соседа, пока перетаскиваемая строка висит над
 * позицией `to`.
 *
 * Нужно для превью: без сдвига соседей строка накрывает список, и непонятно,
 * куда она встанет. Сама перетаскиваемая строка не сдвигается — её ведёт
 * указатель.
 *
 * @param {number} index — индекс соседа
 * @param {number} from — откуда тянут
 * @param {number} to — куда встанет
 * @returns {number} -1, 0 или 1 (в строках)
 */
export const previewShift = (index, from, to) => {
    if (![index, from, to].every(Number.isInteger)) return 0
    if (index === from || from === to) return 0

    if (from < to) return index > from && index <= to ? -1 : 0

    return index >= to && index < from ? 1 : 0
}
