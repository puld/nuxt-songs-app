import { describe, it, expect } from 'vitest'
import { useSongSearch } from './useSongSearch'

describe('useSongSearch', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Осенний дождь',
            body: [
                { type: 'verse', content: 'Листья падают, дождь идет' }
            ]
        },
        {
            number: 2,
            title: 'Весенняя песня',
            body: [
                { type: 'verse', content: 'Птицы поют, солнце светит' }
            ]
        },
        {
            number: 3,
            title: 'Дождь в городе',
            body: [
                { type: 'verse', content: 'Город засыпает под дождем' }
            ]
        }
    ]

    it('должен возвращать реактивные переменные и методы', () => {
        const { searchIndex, searchResults, searchQuery, buildIndex, search } = useSongSearch()

        expect(searchIndex.value).toBe(null)
        expect(searchResults.value).toEqual([])
        expect(searchQuery.value).toBe('')
        expect(typeof buildIndex).toBe('function')
        expect(typeof search).toBe('function')
    })

    describe('buildIndex', () => {
        it('должен создавать поисковый индекс из массива песен', () => {
            const { buildIndex, searchIndex } = useSongSearch()

            buildIndex(mockSongs)

            expect(searchIndex.value).toBeDefined()
            expect(typeof searchIndex.value.search).toBe('function')
        })

        it('должен обновлять searchIndex', () => {
            const { buildIndex, searchIndex } = useSongSearch()

            expect(searchIndex.value).toBe(null)

            buildIndex(mockSongs)

            expect(searchIndex.value).not.toBe(null)
        })
    })

    describe('search', () => {
        it('должен выполнять поиск и обновлять searchResults', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('дождь')

            expect(searchResults.value.length).toBeGreaterThan(0)
        })

        it('должен возвращать результаты отсортированные по релевантности', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('дождь')

            expect(searchResults.value.length).toBeGreaterThan(0)

            // Проверяем, что результаты отсортированы по убыванию score
            for (let i = 1; i < searchResults.value.length; i++) {
                expect(searchResults.value[i - 1].score).toBeGreaterThanOrEqual(searchResults.value[i].score)
            }
        })

        it('должен возвращать пустые результаты при пустом запросе', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)

            search('')
            expect(searchResults.value).toEqual([])

            search('   ')
            expect(searchResults.value).toEqual([])
        })

        it('должен возвращать пустые результаты если индекс не построен', () => {
            const { search, searchResults } = useSongSearch()

            search('дождь')

            expect(searchResults.value).toEqual([])
        })

        it('должен находить песню по заголовку', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('дождь')

            expect(searchResults.value.length).toBeGreaterThan(0)
            // С морфологическим анализом lunr-languages порядок может отличаться
            // Главное - что песни с "дождь" в заголовке находятся
            const songNumbers = searchResults.value.map(r => r.n)
            expect(songNumbers).toContain('1') // "Осенний дождь"
            expect(songNumbers).toContain('3') // "Дождь в городе"
        })

        it('должен находить песню по содержимому', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('птицы')

            expect(searchResults.value.length).toBe(1)
            expect(searchResults.value[0].n).toBe('2')
        })

        it('должен поддерживать нечеткий поиск', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('дожть') // опечатка вместо "дождь"

            expect(searchResults.value.length).toBeGreaterThan(0)
        })

        it('должен возвращать результаты с правильной структурой', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            search('дождь')

            searchResults.value.forEach(result => {
                expect(result).toHaveProperty('n')
                expect(result).toHaveProperty('score')
                expect(result).toHaveProperty('title')
                expect(result.title).toBe('')
            })
        })
    })

    describe('совместная работа buildIndex и search', () => {
        it('должен корректно работать после повторного построения индекса', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            // Первый поиск
            buildIndex(mockSongs)
            search('дождь')
            const firstResultCount = searchResults.value.length

            // Обновляем индекс
            buildIndex(mockSongs)
            search('дождь')
            const secondResultCount = searchResults.value.length

            expect(firstResultCount).toBe(secondResultCount)
        })

        it('должен обновлять результаты при новом запросе', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)

            // Первый запрос
            search('дождь')
            const rainResultsCount = searchResults.value.length

            // Второй запрос
            search('птицы')
            const birdResultsCount = searchResults.value.length

            expect(rainResultsCount).toBeGreaterThan(0)
            expect(birdResultsCount).toBeGreaterThan(0)
            expect(rainResultsCount).not.toBe(birdResultsCount)
        })
    })
})
