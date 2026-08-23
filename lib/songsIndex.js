/**
 * Индексация загруженных песен по номеру — чистые функции без Vue.
 *
 * Нужны, чтобы не искать песню линейным `find` по 1565 записям на каждый
 * результат выдачи поиска: карта строится один раз, дальше — доступ по ключу.
 */

/**
 * Строит карту «номер песни → песня».
 * Номер приводится к числу: в разных источниках он встречается и строкой.
 *
 * @param {Array} songs
 * @returns {Map<number, Object>}
 */
export const buildSongsMap = (songs) => {
    const map = new Map()
    for (const song of songs || []) {
        map.set(Number(song.number), song)
    }
    return map
}

/**
 * Список номеров песен в порядке следования в массиве.
 *
 * `getAllSongs()` и `getSongNumbers()` в IndexedDB отдают записи в порядке
 * ключа (`number`), поэтому номера можно вывести из уже загруженных песен
 * и не делать вторую транзакцию.
 *
 * @param {Array} songs
 * @returns {number[]}
 */
export const songNumbersFrom = (songs) => (songs || []).map(song => Number(song.number))

/**
 * Название песни по номеру.
 *
 * @param {Map<number, Object>} songsMap
 * @param {number|string} number
 * @returns {string} название или «Неизвестная песня», если песни нет
 */
export const getSongTitle = (songsMap, number) => {
    const song = songsMap?.get(Number(number))
    return song ? song.title : 'Неизвестная песня'
}

/**
 * Метка варианта песни.
 *
 * Пустая строка, если песни нет, вариант единственный (метку показывать не
 * нужно) или у варианта нет метки.
 *
 * @param {Map<number, Object>} songsMap
 * @param {number|string} number
 * @param {number} variantIndex
 * @returns {string}
 */
export const getVariantLabel = (songsMap, number, variantIndex) => {
    const song = songsMap?.get(Number(number))
    if (!song?.variants || song.variants.length <= 1) return ''
    return song.variants[variantIndex]?.label || ''
}

/**
 * Строит обратную карту «номер песни → раздел сборника».
 *
 * Разделы хранят списки номеров, а странице песни нужен обратный вопрос — «в
 * каком разделе эта песня». Линейный поиск по 54 разделам с полутора тысячами
 * номеров внутри отвечал бы на него при каждом открытии песни.
 *
 * Песня, попавшая в несколько разделов, закрепляется за первым: сборник такого
 * не допускает (проверяет `songs-data/sections-integrity.js`), но данные могут
 * приехать из старой базы, и молча показать два раздела хуже, чем один.
 *
 * @param {Array<{id: number, title: string, songNumbers: Array}>} sections
 * @returns {Map<number, {id: number, title: string}>}
 */
export const buildSectionIndex = (sections) => {
    const map = new Map()

    for (const section of sections || []) {
        for (const number of section.songNumbers || []) {
            const key = Number(number)
            // `Number(null)` — это 0, поэтому проверяем не только целость:
            // номера песен положительные, ноль в карту попасть не должен.
            if (!Number.isInteger(key) || key <= 0 || map.has(key)) continue

            map.set(key, { id: section.id, title: String(section.title || '') })
        }
    }

    return map
}

/**
 * Раздел песни по номеру.
 *
 * @param {Map<number, {id: number, title: string}>} sectionIndex
 * @param {number|string} number
 * @returns {{id: number, title: string}|null} null, если песня вне разделов
 */
export const getSongSection = (sectionIndex, number) => (
    sectionIndex?.get(Number(number)) || null
)
