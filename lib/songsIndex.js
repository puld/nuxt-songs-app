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
