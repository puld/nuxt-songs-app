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
 * Строит тело payload — три строки без маркера формата.
 *
 * Отдельно от маркера, потому что сжимается (формат `2`) именно тело: маркер
 * обязан читаться до распаковки.
 *
 * @param {{name: string, songsVersion: number, songs: Array}} collection
 * @returns {{ok: boolean, text: string, error: string}}
 */
export const buildShareBody = (collection) => {
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
        name,
        String(normalizeSongsVersion(collection?.songsVersion)),
        list
    ].join('\n')

    return { ok: true, text, error: '' }
}

/**
 * Полный текст payload формата `1`: маркер и тело.
 *
 * @param {{name: string, songsVersion: number, songs: Array}} collection
 * @returns {{ok: boolean, text: string, error: string}}
 */
export const buildSharePayload = (collection) => {
    const { ok, text, error } = buildShareBody(collection)
    if (!ok) return { ok: false, text: '', error }

    return { ok: true, text: `${SHARE_FORMAT_PLAIN}\n${text}`, error: '' }
}

/**
 * Разбирает тело payload (три строки, без маркера). Ошибка — значением.
 *
 * @param {string} text
 * @returns {{ok: boolean, collection: object|null, error: string}}
 */
export const parseShareBody = (text) => {
    if (!text || typeof text !== 'string') {
        return { ok: false, collection: null, error: 'Ссылка пустая' }
    }

    const lines = text.split('\n')
    if (lines.length < 3) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    const name = singleLineName(lines[0])
    if (!name) {
        return { ok: false, collection: null, error: 'В ссылке нет названия подборки' }
    }

    // Номера песен могли переехать между версиями базы, поэтому версия нужна
    // получателю целиком, даже когда она старше его собственной.
    const songsVersion = normalizeSongsVersion(lines[1].trim())

    // Список — последняя строка, но берём её по индексу: имя уже приведено к
    // одной строке, значит лишних строк тут быть не должно.
    const songs = pickSongs(
        lines[2]
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
 * Разбирает полный текст payload формата `1` (маркер и тело).
 *
 * @param {string} text
 * @returns {{ok: boolean, collection: object|null, error: string}}
 */
export const parseSharePayload = (text) => {
    if (!text || typeof text !== 'string') {
        return { ok: false, collection: null, error: 'Ссылка пустая' }
    }

    const newline = text.indexOf('\n')
    if (newline <= 0) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    if (Number(text.slice(0, newline).trim()) !== SHARE_FORMAT_PLAIN) {
        return { ok: false, collection: null, error: 'Ссылка испорчена' }
    }

    return parseShareBody(text.slice(newline + 1))
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
 * Приписывает маркер формата к телу: `<маркер>\n<тело>` в байтах.
 *
 * Собирать строкой нельзя — тело формата `2` не текст.
 */
const withMarker = (format, body) => {
    const head = new TextEncoder().encode(`${format}\n`)
    const bytes = new Uint8Array(head.length + body.length)

    bytes.set(head, 0)
    bytes.set(body, head.length)

    return bytes
}

/** Есть ли в браузере сжатие. Без него ступень 2 просто пропускается. */
export const canCompressShare = () => (
    typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
)

/**
 * Прогоняет байты через поток сжатия или распаковки.
 *
 * @returns {Promise<Uint8Array|null>} `null`, если API нет или данные негодные
 */
const runStream = async (bytes, stream) => {
    if (!bytes) return null

    try {
        const source = new Blob([bytes]).stream().pipeThrough(stream)
        const buffer = await new Response(source).arrayBuffer()

        return new Uint8Array(buffer)
    } catch (e) {
        // Битое тело формата `2` — обычная испорченная ссылка, а не сбой
        // приложения: распаковка обязана вернуть значение, а не бросить.
        return null
    }
}

const gzipBytes = async (bytes) => (
    canCompressShare() ? runStream(bytes, new CompressionStream('gzip')) : null
)

const gunzipBytes = async (bytes) => (
    canCompressShare() ? runStream(bytes, new DecompressionStream('gzip')) : null
)

/**
 * Кодирует подборку в строку для фрагмента ссылки.
 *
 * Ступеней две (третья — экспорт файлом — живёт в интерфейсе, потому что это уже
 * не ссылка). Сжатие включается **только когда без него не влезает**: на
 * небольшой подборке заголовок gzip длиннее выигрыша, а короткая ссылка ценнее
 * формата, который поймут не все версии приложения.
 *
 * `maxLength` — сколько символов остаётся под данные в адресе (считает
 * вызывающий: базовый URL у каждой установки свой). Без него сжатие не
 * применяется вовсе.
 *
 * Асинхронна и для формата `1`: `CompressionStream` синхронным не бывает, а
 * менять сигнатуру после появления вызовов в интерфейсе дороже.
 *
 * @param {{name: string, songsVersion: number, songs: Array}} collection
 * @param {{maxLength?: number}} [options]
 * @returns {Promise<{ok: boolean, data: string, format: number, tooLong: boolean, error: string}>}
 */
export const encodeShare = async (collection, options = {}) => {
    const { ok, text, error } = buildShareBody(collection)
    if (!ok) return { ok: false, data: '', format: 0, tooLong: false, error }

    const body = new TextEncoder().encode(text)
    const plain = bytesToBase64Url(withMarker(SHARE_FORMAT_PLAIN, body))

    const limit = Number(options?.maxLength)
    const hasLimit = Number.isFinite(limit) && limit > 0

    if (!hasLimit || plain.length <= limit) {
        return { ok: true, data: plain, format: SHARE_FORMAT_PLAIN, tooLong: false, error: '' }
    }

    const packedBytes = await gzipBytes(body)
    const packed = packedBytes && bytesToBase64Url(withMarker(SHARE_FORMAT_GZIP, packedBytes))

    // Сжатие может и проиграть: на коротком теле заголовок gzip не окупается.
    // Тогда честнее отдать понятный всем формат `1` и сказать, что не влезло.
    if (!packed || packed.length >= plain.length) {
        return { ok: true, data: plain, format: SHARE_FORMAT_PLAIN, tooLong: true, error: '' }
    }

    return {
        ok: true,
        data: packed,
        format: SHARE_FORMAT_GZIP,
        tooLong: packed.length > limit,
        error: ''
    }
}

/**
 * Байты → текст. Битые байты дают `''`, а не подстановочные символы: иначе
 * испорченная ссылка молча превращается в подборку с мусором в имени.
 */
const decodeUtf8 = (bytes) => {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (e) {
        return ''
    }
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
        if (!canCompressShare()) {
            // Браузер старше `DecompressionStream` (до Safari 16.4). Ссылка
            // цела, разжать её здесь нечем — так и говорим.
            return {
                ok: false,
                collection: null,
                error: 'Этот браузер не умеет разжимать длинные ссылки — откройте ссылку в другом браузере'
            }
        }

        const body = await gunzipBytes(split.body)
        if (!body) return { ok: false, collection: null, error: 'Ссылка испорчена' }

        return parseShareBody(decodeUtf8(body))
    }

    if (split.format !== SHARE_FORMAT_PLAIN) {
        return {
            ok: false,
            collection: null,
            error: 'Ссылка сделана более новой версией приложения — обновите приложение'
        }
    }

    return parseShareBody(decodeUtf8(split.body))
}
