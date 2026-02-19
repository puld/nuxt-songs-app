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

describe('useSongs', () => {
    beforeEach(async () => {
        db = await global.setupTestDB()
        mockDBRef.current = db
    })

    afterEach(() => {
        mockDBRef.current = null
        clearFetchMocks()
        db = null
    })

    describe('fetchSongs', () => {
        it('должен успешно загружать песни из JSON', async () => {
            const mockFetchRestore = mockFetchResponse({ songs: songsData })

            const { fetchSongs } = useSongs()
            const result = await fetchSongs()

            // Проверяем что fetch вызван с правильным путем
            expect(global.fetch).toHaveBeenCalledWith('assets/songs.json')

            expect(result).toBe(false)

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
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(TypeError))

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
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error))

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
