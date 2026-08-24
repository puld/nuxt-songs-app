import { describe, it, expect } from 'vitest'
import {
    buildSharePayload,
    parseSharePayload,
    bytesToBase64Url,
    base64UrlToBytes,
    splitShareMarker,
    encodeShare,
    decodeShare,
    SHARE_FORMAT_PLAIN,
    SHARE_FORMAT_GZIP
} from './collectionShare'

/** Подборка в том виде, в каком её отдаёт база. */
const collection = (songs = [{ songNumber: 14, variantIndex: 0 }]) => ({
    name: 'Молодёжное служение',
    songsVersion: 3,
    songs
})

describe('buildSharePayload', () => {
    it('собирает четыре строки: маркер, имя, версия, список', () => {
        const { ok, text } = buildSharePayload({
            name: 'Молодёжное служение — воскресенье',
            songsVersion: 3,
            songs: [
                { songNumber: 14, variantIndex: 0 },
                { songNumber: 102, variantIndex: 1 },
                { songNumber: 340 }
            ]
        })

        expect(ok).toBe(true)
        expect(text).toBe('1\nМолодёжное служение — воскресенье\n3\n14,102.1,340')
    })

    it('нулевой вариант в списке не пишется', () => {
        // Он у подавляющего большинства песен, а символы уходят в длину ссылки.
        const { text } = buildSharePayload(collection([{ songNumber: 7, variantIndex: 0 }]))

        expect(text.split('\n')[3]).toBe('7')
    })

    it('перевод строки в имени схлопывается в пробел', () => {
        // Иначе строки payload сдвинулись бы, и получатель прочитал бы имя как версию.
        const { text } = buildSharePayload({ ...collection(), name: 'Утро\nи вечер' })

        expect(text.split('\n')).toHaveLength(4)
        expect(text.split('\n')[1]).toBe('Утро и вечер')
    })

    it('повторы пары «песня + вариант» схлопываются', () => {
        const { text } = buildSharePayload(collection([
            { songNumber: 14, variantIndex: 0 },
            { songNumber: 14, variantIndex: 0 },
            { songNumber: 14, variantIndex: 1 }
        ]))

        expect(text.split('\n')[3]).toBe('14,14.1')
    })

    it('мусорные записи отбрасываются', () => {
        const { text } = buildSharePayload(collection([
            { songNumber: 0 },
            { songNumber: -3 },
            { songNumber: 'нет' },
            null,
            { songNumber: 14, variantIndex: -1 }
        ]))

        // Отрицательный вариант прижимается к нулю, остальное выброшено.
        expect(text.split('\n')[3]).toBe('14')
    })

    it('непригодная версия базы становится нулём', () => {
        const { text } = buildSharePayload({ ...collection(), songsVersion: 'три' })

        expect(text.split('\n')[2]).toBe('0')
    })

    it('без названия и без песен — ошибка значением', () => {
        expect(buildSharePayload({ ...collection(), name: '   ' }))
            .toEqual({ ok: false, text: '', error: 'У подборки нет названия' })
        expect(buildSharePayload({ ...collection(), songs: [] }))
            .toEqual({ ok: false, text: '', error: 'В подборке нет песен' })
    })
})

describe('parseSharePayload', () => {
    it('читает то, что собрал buildSharePayload', () => {
        const { text } = buildSharePayload({
            name: 'Вечернее',
            songsVersion: 12,
            songs: [{ songNumber: 14 }, { songNumber: 102, variantIndex: 1 }]
        })

        expect(parseSharePayload(text)).toEqual({
            ok: true,
            collection: {
                name: 'Вечернее',
                songsVersion: 12,
                songs: [
                    { songNumber: 14, variantIndex: 0 },
                    { songNumber: 102, variantIndex: 1 }
                ]
            },
            error: ''
        })
    })

    it('пробелы вокруг номеров не мешают', () => {
        const { collection: parsed } = parseSharePayload('1\nИмя\n1\n 14 , 102.1 ')

        expect(parsed.songs).toEqual([
            { songNumber: 14, variantIndex: 0 },
            { songNumber: 102, variantIndex: 1 }
        ])
    })

    it('чужой маркер формата не разбирается как обычный текст', () => {
        expect(parseSharePayload('9\nИмя\n1\n14').ok).toBe(false)
    })

    it('обрезанный payload — ошибка, а не половина подборки', () => {
        expect(parseSharePayload('1\nИмя\n1').ok).toBe(false)
        expect(parseSharePayload('').ok).toBe(false)
        expect(parseSharePayload(undefined).ok).toBe(false)
    })

    it('пустое имя и пустой список — ошибки с разными сообщениями', () => {
        expect(parseSharePayload('1\n \n1\n14').error).toBe('В ссылке нет названия подборки')
        expect(parseSharePayload('1\nИмя\n1\n, ,').error).toBe('В ссылке нет песен')
    })
})

describe('base64url', () => {
    it('кириллица переживает круговой прогон', () => {
        // btoa работает с latin1, поэтому кодируем байты UTF-8, а не строку.
        const source = 'Молодёжное — 14'
        const bytes = new TextEncoder().encode(source)

        const decoded = base64UrlToBytes(bytesToBase64Url(bytes))

        expect(new TextDecoder().decode(decoded)).toBe(source)
    })

    it('в результате нет символов, опасных для URL', () => {
        // Байты подобраны так, чтобы обычный base64 дал и «+», и «/».
        const data = bytesToBase64Url(new Uint8Array([251, 255, 190, 255]))

        expect(data).not.toMatch(/[+/=]/)
    })

    it('байты с «+» и «/» в обычном base64 переживают круговой прогон', () => {
        // Проверяем обратную замену алфавита: без неё atob получил бы «-» и «_».
        const source = new Uint8Array([251, 255, 190, 255])

        expect(Array.from(base64UrlToBytes(bytesToBase64Url(source)))).toEqual(Array.from(source))
    })

    it('непригодная строка даёт null, а не исключение', () => {
        expect(base64UrlToBytes('!!!')).toBeNull()
        expect(base64UrlToBytes('')).toBeNull()
        expect(base64UrlToBytes(null)).toBeNull()
    })
})

describe('splitShareMarker', () => {
    it('отделяет маркер от тела, не трогая тело', () => {
        const bytes = new Uint8Array([50, 10, 1, 2, 3]) // "2\n" + произвольные байты

        const split = splitShareMarker(bytes)

        expect(split.format).toBe(2)
        expect(Array.from(split.body)).toEqual([1, 2, 3])
    })

    it('без маркера и без перевода строки — null', () => {
        expect(splitShareMarker(new Uint8Array([10, 1]))).toBeNull()
        expect(splitShareMarker(new Uint8Array([49, 50]))).toBeNull()
        expect(splitShareMarker(new Uint8Array())).toBeNull()
    })
})

describe('encodeShare / decodeShare', () => {
    it('подборка переживает круговой прогон', async () => {
        const source = {
            name: 'Молодёжное служение — воскресенье',
            songsVersion: 3,
            songs: [
                { songNumber: 14, variantIndex: 0 },
                { songNumber: 102, variantIndex: 1 },
                { songNumber: 1120, variantIndex: 2 }
            ]
        }

        const { ok, data } = await encodeShare(source)
        expect(ok).toBe(true)

        await expect(decodeShare(data)).resolves.toEqual({
            ok: true,
            collection: source,
            error: ''
        })
    })

    it('закодированная ссылка пригодна для URL', async () => {
        const { data } = await encodeShare(collection())

        expect(data).not.toMatch(/[+/=]/)
        expect(encodeURIComponent(data)).toBe(data)
    })

    it('ошибка сборки доходит до вызывающего', async () => {
        await expect(encodeShare({ ...collection(), songs: [] }))
            .resolves.toMatchObject({ ok: false, data: '', error: 'В подборке нет песен' })
    })

    it('испорченная ссылка не даёт подборку с мусором', async () => {
        // Байт 0xff стоит на месте имени, а структура payload цела: без fatal
        // у TextDecoder он стал бы «\ufffd», и подборка сохранилась бы с
        // именем из подстановочных символов вместо честной ошибки.
        const broken = bytesToBase64Url(new Uint8Array([49, 10, 0xff, 10, 49, 10, 49, 52]))

        await expect(decodeShare(broken)).resolves.toMatchObject({ ok: false })
        await expect(decodeShare('не-base64!')).resolves.toMatchObject({ ok: false })
        await expect(decodeShare('')).resolves.toMatchObject({ ok: false })
    })

    it('неизвестный формат честно говорит про версию приложения', async () => {
        // Формат 3 в этой версии не существует: такая ссылка может прийти
        // только от более новой, и «испорчена» было бы неправдой.
        const future = bytesToBase64Url(new Uint8Array([51, 10, 31, 139, 8]))

        const result = await decodeShare(future)

        expect(result.ok).toBe(false)
        expect(result.error).toContain('обновите приложение')
    })

    it('тело формата 2 с мусором вместо gzip — испорченная ссылка', async () => {
        const broken = bytesToBase64Url(new Uint8Array([50, 10, 1, 2, 3, 4]))

        await expect(decodeShare(broken)).resolves.toMatchObject({ ok: false, error: 'Ссылка испорчена' })
    })
})

describe('encodeShare: ступени по длине ссылки', () => {
    /** Подборка из `count` песен — чтобы гнать длину ссылки вверх. */
    const bigCollection = (count) => ({
        name: 'Большая подборка со сколько-нибудь длинным именем',
        songsVersion: 3,
        songs: Array.from({ length: count }, (_, i) => ({ songNumber: 1000 + i, variantIndex: 0 }))
    })

    it('без ограничения длины сжатие не включается', async () => {
        const result = await encodeShare(bigCollection(500))

        expect(result.format).toBe(SHARE_FORMAT_PLAIN)
        expect(result.tooLong).toBe(false)
    })

    it('короткая ссылка остаётся несжатой, даже когда ограничение задано', async () => {
        // Сжатие понимают не все версии приложения, а выигрыша на коротком
        // теле нет вовсе — заголовок gzip его съедает.
        const result = await encodeShare(collection(), { maxLength: 2000 })

        expect(result.format).toBe(SHARE_FORMAT_PLAIN)
        expect(result.tooLong).toBe(false)
    })

    it('длинная подборка уходит в gzip и влезает в тот же лимит', async () => {
        const maxLength = 1000
        const plain = await encodeShare(bigCollection(300))
        const result = await encodeShare(bigCollection(300), { maxLength })

        expect(plain.data.length).toBeGreaterThan(maxLength)
        expect(result.format).toBe(SHARE_FORMAT_GZIP)
        expect(result.data.length).toBeLessThan(plain.data.length)
        expect(result.tooLong).toBe(false)
    })

    it('сжатая ссылка разбирается обратно в ту же подборку', async () => {
        const source = bigCollection(300)
        const { data, format } = await encodeShare(source, { maxLength: 700 })

        expect(format).toBe(SHARE_FORMAT_GZIP)

        const decoded = await decodeShare(data)

        expect(decoded.ok).toBe(true)
        expect(decoded.collection.name).toBe(source.name)
        expect(decoded.collection.songsVersion).toBe(source.songsVersion)
        expect(decoded.collection.songs).toEqual(source.songs)
    })

    it('не влезло даже сжатым — говорит об этом, но ссылку отдаёт', async () => {
        // Ступень 3 (экспорт файлом) живёт в интерфейсе, поэтому модуль не
        // отказывает: он сообщает `tooLong`, а решение принимает страница.
        const result = await encodeShare(bigCollection(600), { maxLength: 200 })

        expect(result.ok).toBe(true)
        expect(result.format).toBe(SHARE_FORMAT_GZIP)
        expect(result.tooLong).toBe(true)
        expect(result.data).not.toBe('')
    })

    it('когда сжатие проигрывает по длине, остаётся формат 1', async () => {
        // Тело короткое: gzip добавляет заголовок и делает строку длиннее.
        const result = await encodeShare(collection(), { maxLength: 10 })

        expect(result.format).toBe(SHARE_FORMAT_PLAIN)
        expect(result.tooLong).toBe(true)
    })

    it('маркеры формата различны', () => {
        expect(SHARE_FORMAT_PLAIN).not.toBe(SHARE_FORMAT_GZIP)
    })
})
