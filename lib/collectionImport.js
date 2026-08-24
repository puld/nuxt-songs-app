/**
 * Импорт подборки, пришедшей ссылкой: сверка версии базы и план сохранения.
 *
 * Ссылка несёт только номера песен и индексы вариантов (см.
 * `lib/collectionShare.js`), а тексты у получателя свои. Значит перед
 * сохранением надо ответить на два вопроса: та ли у получателя база и что
 * делать с песнями, которых в ней нет.
 */

import { normalizeCollectionName } from './collectionsBackup'

/** База получателя годится — можно импортировать. */
export const VERSION_OK = 'ok'

/** База получателя старше той, в которой собрана ссылка. */
export const VERSION_OUTDATED = 'outdated'

/** База получателя новее — импорт возможен, но варианты могли разъехаться. */
export const VERSION_AHEAD = 'ahead'

/**
 * Сверяет версию базы получателя с версией из ссылки.
 *
 * Меньшая версия у получателя — единственный случай, когда импорт
 * останавливается: номеров из ссылки в старой базе может просто не быть, и
 * половина подборки молча превратилась бы в «песня не найдена».
 *
 * Обратный случай (база получателя новее) безопасен: подборка ссылается на
 * номера, а они стабильны. Разъехаться могут только варианты, поэтому он
 * отделён от полного совпадения — на экране это мягкое предупреждение.
 */
export const checkSongsVersion = (payloadVersion, localVersion) => {
    const payload = Number(payloadVersion) || 0
    const local = Number(localVersion) || 0

    if (local < payload) return VERSION_OUTDATED
    return local > payload ? VERSION_AHEAD : VERSION_OK
}

/** Песня есть, вариант существует — сохраняем как есть. */
export const ITEM_OK = 'ok'

/** Песня есть, а варианта с таким индексом нет — прижимаем к нулевому. */
export const ITEM_VARIANT_FALLBACK = 'variant-fallback'

/** Песни с таким номером в базе нет — пропускаем. */
export const ITEM_MISSING = 'missing'

const variantsCount = (song) => (
    Array.isArray(song?.variants) && song.variants.length > 0 ? song.variants.length : 1
)

/**
 * Разбирает список из ссылки на то, что реально можно сохранить.
 *
 * Отсутствующая песня не отменяет импорт целиком: у получателя может быть база
 * поновее, где номер переехал, и терять из-за одной песни всю подборку хуже,
 * чем сохранить остальное с пометкой.
 *
 * @param {Array<{songNumber: number, variantIndex: number}>} songs список из ссылки
 * @param {Map<number, object>} songsMap карта «номер → песня» (`lib/songsIndex.js`)
 * @returns {{items: Array, toSave: Array, missing: number, adjusted: number}}
 */
export const planShareImport = (songs, songsMap) => {
    const items = []

    for (const entry of Array.isArray(songs) ? songs : []) {
        const songNumber = Number(entry?.songNumber)
        if (!Number.isInteger(songNumber) || songNumber <= 0) continue

        const song = songsMap?.get?.(songNumber) || null
        const requested = Number(entry?.variantIndex) || 0

        if (!song) {
            items.push({ songNumber, variantIndex: requested, title: '', status: ITEM_MISSING })
            continue
        }

        const fits = requested >= 0 && requested < variantsCount(song)

        items.push({
            songNumber,
            variantIndex: fits ? requested : 0,
            requestedVariantIndex: requested,
            title: song.title || '',
            status: fits ? ITEM_OK : ITEM_VARIANT_FALLBACK
        })
    }

    return {
        items,
        toSave: items.filter((item) => item.status !== ITEM_MISSING),
        missing: items.filter((item) => item.status === ITEM_MISSING).length,
        adjusted: items.filter((item) => item.status === ITEM_VARIANT_FALLBACK).length
    }
}

/**
 * Ищет подборку получателя с тем же именем.
 *
 * «Избранное» из поиска исключено: имя у него служебное, и слить чужую подборку
 * с ним нельзя даже при совпадении названия.
 */
export const findSameNameCollection = (name, collections = []) => {
    const target = normalizeCollectionName(name)
    if (!target) return null

    return collections.find((collection) => (
        collection?.isFavorite !== 1 && normalizeCollectionName(collection?.name) === target
    )) || null
}

/**
 * Имя для новой подборки, когда пользователь решил не сливать с существующей.
 *
 * Две подборки с одинаковым именем в списке неразличимы, поэтому к копии
 * добавляется счётчик: «Рождество (2)», «Рождество (3)» и так далее.
 */
export const uniqueCollectionName = (name, collections = []) => {
    const base = String(name ?? '').trim()
    if (!base) return base

    const taken = new Set(collections.map((collection) => normalizeCollectionName(collection?.name)))
    if (!taken.has(normalizeCollectionName(base))) return base

    let counter = 2
    while (taken.has(normalizeCollectionName(`${base} (${counter})`))) counter += 1

    return `${base} (${counter})`
}
