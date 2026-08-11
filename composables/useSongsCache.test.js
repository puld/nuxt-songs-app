import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

// Создаем переменные для mock-ов
const mockDBRef = { current: null }

// Мокаем модуль Nuxt до импорта composables
vi.mock('nuxt/app', () => ({
    useNuxtApp: vi.fn(() => ({
        $indexedDB: mockDBRef.current
    }))
}))

// Импортируем composables после vi.mock
import { useSongsCache, invalidateSongsCache } from './useSongsCache'
import { useIndexDB } from './useIndexDB'

// В `addSongs` номер приходит в поле `n` (формат songs.json),
// в хранилище он лежит уже как `number`.
const songsFixture = [
    { n: 1, title: 'Первая', variants: [{ label: '', body: [] }] },
    { n: 2, title: 'Вторая', variants: [{ label: '', body: [] }] }
]

const thirdSong = { n: 3, title: 'Третья', variants: [{ label: '', body: [] }] }

let db = null

describe('useSongsCache', () => {
    beforeEach(async () => {
        db = await global.setupTestDB()
        mockDBRef.current = db
        // Кэш живёт на уровне модуля — между тестами его надо сбрасывать
        invalidateSongsCache()
    })

    afterEach(() => {
        mockDBRef.current = null
        db = null
    })

    describe('loadSongs', () => {
        it('загружает песни, номера и карту по номеру', async () => {
            await useIndexDB().addSongs(songsFixture)

            const { loadSongs, allSongs, songNumbers, songsMap } = useSongsCache()
            const result = await loadSongs()

            expect(result.songs).toHaveLength(2)
            expect(result.numbers).toEqual([1, 2])
            expect(result.map.get(1).title).toBe('Первая')

            // Те же данные доступны через реактивные поля
            expect(allSongs.value).toHaveLength(2)
            expect(songNumbers.value).toEqual([1, 2])
            expect(songsMap.value.get(2).title).toBe('Вторая')
        })

        it('второй вызов отдаёт кэш, а не читает базу заново', async () => {
            await useIndexDB().addSongs(songsFixture)

            const { loadSongs } = useSongsCache()
            await loadSongs()

            // Меняем базу: если бы кэша не было, песня бы появилась в выдаче
            await useIndexDB().addSongs([...songsFixture, thirdSong])

            const second = await loadSongs()
            expect(second.songs).toHaveLength(2)
            expect(second.numbers).toEqual([1, 2])
        })

        it('одновременные вызовы дают один запрос к базе и один результат', async () => {
            await useIndexDB().addSongs(songsFixture)

            const { loadSongs } = useSongsCache()
            const [first, second] = await Promise.all([loadSongs(), loadSongs()])

            expect(first).toBe(second)
        })

        it('пустая база даёт пустой кэш', async () => {
            const { loadSongs } = useSongsCache()
            const result = await loadSongs()

            expect(result.songs).toEqual([])
            expect(result.numbers).toEqual([])
            expect(result.map.size).toBe(0)
        })
    })

    describe('invalidateSongsCache', () => {
        it('после инвалидации база читается заново', async () => {
            await useIndexDB().addSongs(songsFixture)

            const { loadSongs, allSongs } = useSongsCache()
            await loadSongs()

            await useIndexDB().addSongs([...songsFixture, thirdSong])
            invalidateSongsCache()

            const result = await loadSongs()
            expect(result.songs).toHaveLength(3)
            expect(result.numbers).toEqual([1, 2, 3])
            expect(allSongs.value).toHaveLength(3)
        })

        it('сбрасывает реактивные поля сразу', async () => {
            await useIndexDB().addSongs(songsFixture)

            const { loadSongs, allSongs, songNumbers, songsMap } = useSongsCache()
            await loadSongs()

            invalidateSongsCache()

            expect(allSongs.value).toEqual([])
            expect(songNumbers.value).toEqual([])
            expect(songsMap.value.size).toBe(0)
        })
    })

    describe('ошибки', () => {
        it('неудачная загрузка не кэшируется — следующая попытка читает базу', async () => {
            await useIndexDB().addSongs(songsFixture)

            // Сбой базы: обращение к хранилищу бросает исключение — так ведёт
            // себя закрытое или повреждённое соединение. Инстанс composable
            // захватывает $indexedDB в момент вызова, поэтому «сломанный» и
            // «рабочий» инстансы создаём отдельно — как это и происходит при
            // монтировании компонентов.
            // (Именно исключение, а не null: null плагин провайдит при отказе
            // базы, и useIndexDB отдаёт на нём пустой список без ошибки.)
            mockDBRef.current = { transaction: () => { throw new Error('база закрыта') } }
            await expect(useSongsCache().loadSongs()).rejects.toThrow()

            mockDBRef.current = db

            const result = await useSongsCache().loadSongs()
            expect(result.songs).toHaveLength(2)
        })
    })
})
