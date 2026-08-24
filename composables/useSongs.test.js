import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { mockFetchResponse, mockFetchError, mockFetchWrongContentType, clearFetchMocks } from '../test/helpers/fetch'
import songsData from '../test/fixtures/songs.json'

// Создаем переменные для mock-ов
const mockDBRef = { current: null }

// Мокаем модуль Nuxt до импорта composables
vi.mock('nuxt/app', () => ({
    useNuxtApp: vi.fn(() => ({
        $indexedDB: mockDBRef.current
    }))
}))

// Импортируем composables после vi.mock
import { useSongs } from './useSongs'

let db = null

// Заглушка настроек: `useSettingsStore` — авто-импорт Nuxt, в тестах его нет.
// Нужна не ради самого стора, а чтобы видеть, что fetchSongs записывает версию
// базы и ETag, — без неё ветка сохранения молча падала бы внутри try/catch.
const settingsStore = {
    setSongsEtag: vi.fn(),
    setSongsVersion: vi.fn()
}

globalThis.useSettingsStore = () => settingsStore

describe('useSongs', () => {
    beforeEach(async () => {
        db = await global.setupTestDB()
        mockDBRef.current = db
    })

    afterEach(() => {
        mockDBRef.current = null
        clearFetchMocks()
        settingsStore.setSongsEtag.mockClear()
        settingsStore.setSongsVersion.mockClear()
        db = null
    })

    describe('fetchSongs', () => {
        it('должен успешно загружать песни из JSON', async () => {
            const mockFetchRestore = mockFetchResponse({ songs: songsData })

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            // Проверяем что fetch вызван с правильным путем
            expect(global.fetch).toHaveBeenCalledWith('assets/songs.json')

            expect(result).toBe(true)

            mockFetchRestore()
        })

        it('сохраняет разделы сборника вместе с песнями', async () => {
            const sections = [{ id: 0, title: 'Перед началом собрания', song_ns: [1, 2] }]
            const mockFetchRestore = mockFetchResponse({ songs: songsData, sections })

            await useSongs().fetchSongs()

            const saved = await new Promise((resolve) => {
                const request = db.transaction(['sections'], 'readonly').objectStore('sections').getAll()
                request.onsuccess = () => resolve(request.result)
            })

            expect(saved).toEqual([{ id: 0, title: 'Перед началом собрания', songNumbers: [1, 2] }])

            mockFetchRestore()
        })

        it('файл без разделов не срывает загрузку песен', async () => {
            const mockFetchRestore = mockFetchResponse({ songs: songsData })

            await expect(useSongs().fetchSongs()).resolves.toBe(true)

            mockFetchRestore()
        })

        it('сохраняет версию базы из корня файла', async () => {
            const mockFetchRestore = mockFetchResponse({ version: 7, songs: songsData })

            await useSongs().fetchSongs()

            expect(settingsStore.setSongsVersion).toHaveBeenCalledWith(7)

            mockFetchRestore()
        })

        it('файл без версии не срывает загрузку — версию решает нормализация', async () => {
            // songs.json мог приехать из кэша PWA от сборки без версии.
            const mockFetchRestore = mockFetchResponse({ songs: songsData })

            await expect(useSongs().fetchSongs()).resolves.toBe(true)
            expect(settingsStore.setSongsVersion).toHaveBeenCalledWith(undefined)

            mockFetchRestore()
        })

        it('должен обрабатывать ошибку сети 404', async () => {
            const mockFetchRestore = mockFetchError(404)
            const consoleErrorSpy = vi.spyOn(console, 'error')

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            expect(result).toBe(false)
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Ошибка загрузки песен:',
                expect.any(Error)
            )

            consoleErrorSpy.mockRestore()
            mockFetchRestore()
        })

        it('должен обрабатывать ошибку сети 500', async () => {
            const mockFetchRestore = mockFetchError(500)
            const consoleErrorSpy = vi.spyOn(console, 'error')

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            expect(result).toBe(false)
            expect(consoleErrorSpy).toHaveBeenCalled()

            consoleErrorSpy.mockRestore()
            mockFetchRestore()
        })

        it('должен обрабатывать неправильный Content-Type', async () => {
            const mockFetchRestore = mockFetchWrongContentType('text/html')
            const consoleErrorSpy = vi.spyOn(console, 'error')

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            expect(result).toBe(false)
            expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка загрузки песен:', expect.any(TypeError))

            consoleErrorSpy.mockRestore()
            mockFetchRestore()
        })

        it('должен обрабатывать ошибку парсинга JSON', async () => {
            const mockFetchRestore = mockFetchResponse('некорректный json', {
                contentType: 'application/json'
            })
            const consoleErrorSpy = vi.spyOn(console, 'error')

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            expect(result).toBe(false)
            expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка загрузки песен:', expect.any(Error))

            consoleErrorSpy.mockRestore()
            mockFetchRestore()
        })

        it('должен обрабатывать отсутствие поля songs в ответе', async () => {
            const mockFetchRestore = mockFetchResponse({ data: songsData }) // без поля songs
            const consoleErrorSpy = vi.spyOn(console, 'error')

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            expect(result).toBe(false)
            expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка загрузки песен:', expect.any(Error))

            consoleErrorSpy.mockRestore()
            mockFetchRestore()
        })
    })
})
