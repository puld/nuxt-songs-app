/**
 * Ссылка на подборку: кодирование и разбор.
 *
 * Подборки локальны в IndexedDB с autoIncrement `id`, поэтому делиться `id`
 * бессмысленно. Общее у всех — база песен, значит подборка в ссылке это
 * `{ имя, версия базы, список (номер песни, вариант) }`. Тексты не передаются.
 *
 * Формат payload — компактная строка, а не JSON: она уезжает в URL, где каждый
 * символ виден пользователю и считается мессенджерами.
 *
 * ```
 * 1
 * Молодёжное служение — воскресенье
 * 3
 * 14,102.1,340,507,1120.2
 * ```
 *
 * Первая строка — маркер формата (`1` — без сжатия, `2` — gzip, ступень 4.5
 * дорожной карты). Маркер лежит **вне** сжимаемой части и потому читается до
 * распаковки: иначе получатель не смог бы понять, чем распаковывать тело.
 * Именно поэтому здесь работа идёт с байтами (`Uint8Array`), а не со строкой —
 * у сжатого тела текстового представления нет.
 *
 * Всё здесь — чистые функции: ни базы, ни DOM, ни адреса приложения.
 */

import { normalizeSongsVersion } from './songsVersion'

/** Маркер формата: тело — UTF-8 текст payload как есть. */
export const SHARE_FORMAT_PLAIN = 1

/** Маркер формата: тело сжато gzip (ступень 2, пункт 4.5 дорожной карты). */
export const SHARE_FORMAT_GZIP = 2

/** Разделитель номеров песен в последней строке payload. */
const SONG_SEPARATOR = ','

/** Отделяет индекс варианта от номера песни: `102.1`. */
const VARIANT_SEPARATOR = '.'

/**
 * Приводит имя подборки к одной строке.
 *
 * Перевод строки внутри имени сдвинул бы все последующие строки payload, и
 * получатель прочитал бы имя как версию базы. В интерфейсе имя однострочное, но
 * в базу оно могло попасть импортом файла, который правили руками.
 */
const singleLineName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim()

/**
 * Оставляет из ссылки на песню только то, что переживёт передачу.
 *
 * @returns {{songNumber: number, variantIndex: number}|null}
 */
const pickSong = (song) => {
    const songNumber = Number(song?.songNumber ?? song?.n)
    if (!Number.isInteger(songNumber) || songNumber <= 0) return null

    const variantIndex = Number(song?.variantIndex)

    return {
        songNumber,
        variantIndex: Number.isInteger(variantIndex) && variantIndex > 0 ? variantIndex : 0
    }
}

/**
 * Собирает список песен: мусор отбрасывается, повторы схлопываются.
 *
 * Повтор пары «песня + вариант» в базе невозможен (уникальный индекс), но
 * список может прийти и из разобранной ссылки, которую правили руками.
 */
const pickSongs = (songs) => {
    const seen = new Set()
    const result = []

    for (const song of Array.isArray(songs) ? songs : []) {
        const picked = pickSong(song)
        if (!picked) continue

        const key = `${picked.songNumber}.${picked.variantIndex}`
        if (seen.has(key)) continue

        seen.add(key)
        result.push(picked)
    }

    return result
}

/**
 * Строит текст payload формата `1`.
 *
 * @param {{name: string, songsVersion: number, songs: Array}} collection
 * @returns {{ok: boolean, text: string, error: string}}
 */
export const buildSharePayload = (collection) => {
    const name = singleLineName(collection?.name)
    if (!name) {
        return { ok: false, text: '', error: 'У подборки нет названия' }
    }

    const songs = pickSongs(collection?.songs)
    if (songs.length === 0) {
        // Ссылка на пустую подборку у получателя выглядела бы как поломка:
        // страница импорта открылась, а сохранять нечего.
        return { ok: false, text: '', error: 'В подборке нет песен' }
    }

    const list = songs
        .map(({ songNumber, variantIndex }) => (
            // Нулевой вариант не пишем: он у подавляющего большинства песен,
            // а каждый лишний символ уходит в длину ссылки.
            variantIndex > 0 ? `${songNumber}${VARIANT_SEPARATOR}${variantIndex}` : String(songNumber)
        ))
        .join(SONG_SEPARATOR)

    const text = [
        String(SHARE_FORMAT_PLAIN),
        name,
        String(normalizeSongsVersion(collection?.songsVersion)),
        list
    ].join('\n')

    return { ok: true, text, error: '' }
}

/**
 * Разбирает текст payload формата `1`. Никогда не бросает — ошибка значением.
 *
 * @param {string} text
 * @returns {{ok: boolean, collection: object|null, error: string}}
 */
export const parseSharePayload = (text) => {
    if (!text || typeof text !== 'string') {
        return { ok: false, collection: null, error: 'Ссылка пустая' }
    }

    const lines = text.split('\n')
    if (lines.length < 4) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    const format = Number(lines[0].trim())
    if (format !== SHARE_FORMAT_PLAIN) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    const name = singleLineName(lines[1])
    if (!name) {
        return { ok: false, collection: null, error: 'В ссылке нет названия подборки' }
    }

    // Номера песен могли переехать между версиями базы, поэтому версия нужна
    // получателю целиком, даже когда она старше его собственной.
    const songsVersion = normalizeSongsVersion(lines[2].trim())

    // Список — последняя строка, но берём её по индексу: имя уже приведено к
    // одной строке, значит лишних строк тут быть не должно.
    const songs = pickSongs(
        lines[3]
            .split(SONG_SEPARATOR)
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => {
                const [number, variant] = item.split(VARIANT_SEPARATOR)
                return { songNumber: number, variantIndex: variant }
            })
    )

    if (songs.length === 0) {
        return { ok: false, collection: null, error: 'В ссылке нет песен' }
    }

    return { ok: true, collection: { name, songsVersion, songs }, error: '' }
}

/**
 * Байты → base64url (алфавит URL: `-` и `_`, без выравнивающих `=`).
 *
 * Обычный base64 в ссылке нельзя: `+` и `/` меняют смысл в URL, а `=` часть
 * мессенджеров обрезает вместе с хвостом ссылки.
 */
export const bytesToBase64Url = (bytes) => {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

/**
 * base64url → байты. Непригодная строка даёт `null`, а не исключение.
 *
 * @returns {Uint8Array|null}
 */
export const base64UrlToBytes = (data) => {
    if (!data || typeof data !== 'string') return null

    const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
    // Выравнивание при кодировании отброшено — возвращаем, иначе atob не примет.
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)

    let binary
    try {
        binary = atob(padded)
    } catch (e) {
        return null
    }

    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

    return bytes
}

/**
 * Читает маркер формата, не трогая тело.
 *
 * Нужен именно на байтах: у сжатого тела (формат `2`) текстового представления
 * нет, а решить, чем его распаковывать, надо до распаковки.
 *
 * @param {Uint8Array} bytes
 * @returns {{format: number, body: Uint8Array}|null}
 */
export const splitShareMarker = (bytes) => {
    if (!bytes || bytes.length === 0) return null

    const newline = bytes.indexOf(10) // '\n'
    if (newline <= 0) return null

    let marker = ''
    for (let i = 0; i < newline; i += 1) marker += String.fromCharCode(bytes[i])

    const format = Number(marker.trim())
    if (!Number.isInteger(format) || format <= 0) return null

    return { format, body: bytes.subarray(newline + 1) }
}

/**
 * Кодирует подборку в строку для фрагмента ссылки.
 *
 * Асинхронна, хотя формат `1` кодируется синхронно: gzip-ступень (4.5) работает
 * через `CompressionStream`, то есть только асинхронно. Менять сигнатуру после
 * того, как её начнут звать из интерфейса, дороже, чем принять `await` сразу.
 *
 * @param {{name: string, songsVersion: number, songs: Array}} collection
 * @returns {Promise<{ok: boolean, data: string, error: string}>}
 */
export const encodeShare = async (collection) => {
    const { ok, text, error } = buildSharePayload(collection)
    if (!ok) return { ok: false, data: '', error }

    return { ok: true, data: bytesToBase64Url(new TextEncoder().encode(text)), error: '' }
}

/**
 * Разбирает строку из фрагмента ссылки обратно в подборку.
 *
 * @param {string} data
 * @returns {Promise<{ok: boolean, collection: object|null, error: string}>}
 */
export const decodeShare = async (data) => {
    const bytes = base64UrlToBytes(data)
    const split = bytes && splitShareMarker(bytes)

    if (!split) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    if (split.format === SHARE_FORMAT_GZIP) {
        // Сжатие появится в 4.5. До тех пор такая ссылка может прийти только от
        // более новой версии приложения — так и говорим, вместо «испорчена».
        return {
            ok: false,
            collection: null,
            error: 'Ссылка сделана более новой версией приложения — обновите приложение'
        }
    }

    if (split.format !== SHARE_FORMAT_PLAIN) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    let text
    try {
        // fatal: битые байты должны стать ошибкой разбора, а не подстановочными
        // символами: иначе испорченная ссылка молча даёт подборку с мусором.
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (e) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    return parseSharePayload(text)
}
