import { describe, it, expect, beforeEach } from 'vitest'
import { useSongSearch, resetSearchIndex } from './useSongSearch'

describe('useSongSearch', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Осенний дождь',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Листья падают, дождь идет' }] }
            ]
        },
        {
            number: 2,
            title: 'Весенняя песня',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Птицы поют, солнце светит' }] }
            ]
        },
        {
            number: 3,
            title: 'Дождь в городе',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Город засыпает под дождем' }] }
            ]
        }
    ]

    // Индексы — синглтон на уровне модуля, между тестами их надо сбрасывать
    beforeEach(() => {
        resetSearchIndex()
    })

    it('должен возвращать реактивные переменные и методы', () => {
        const { searchIndex, exactIndex, searchResults, searchQuery, buildIndex, search } = useSongSearch()

        expect(searchIndex.value).toBe(null)
        expect(exactIndex.value).toBe(null)
        expect(searchResults.value).toEqual([])
        expect(searchQuery.value).toBe('')
        expect(typeof buildIndex).toBe('function')
        expect(typeof search).toBe('function')
    })

    describe('buildIndex', () => {
        it('должен создавать поисковый индекс из массива песен', () => {
            const { buildIndex, searchIndex, exactIndex } = useSongSearch()

            buildIndex(mockSongs)

            expect(searchIndex.value).toBeDefined()
            expect(typeof searchIndex.value.search).toBe('function')
        })

        it('должен создавать exactIndex при buildIndex', () => {
            const { buildIndex, exactIndex } = useSongSearch()

            expect(exactIndex.value).toBe(null)

            buildIndex(mockSongs)

            expect(Array.isArray(exactIndex.value)).toBe(true)
            expect(exactIndex.value.length).toBeGreaterThan(0)
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
                expect(result).toHaveProperty('matchType')
                expect(['exact', 'lunr']).toContain(result.matchType)
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

    describe('синглтон индексов', () => {
        const otherSongs = [
            {
                number: 42,
                title: 'Зимняя дорога',
                variants: [
                    { label: '', body: [{ type: 'verse', content: 'Снег скрипит под полозьями' }] }
                ]
            }
        ]

        it('индексы общие: второй инстанс ищет без своего buildIndex', () => {
            useSongSearch().buildIndex(mockSongs)

            // Второй инстанс индекс не строил
            const { search, searchResults } = useSongSearch()
            search('дождь')

            expect(searchResults.value.length).toBeGreaterThan(0)
        })

        it('повторный buildIndex не перестраивает индекс', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            // Второй набор песен должен быть проигнорирован
            buildIndex(otherSongs)

            search('зимняя')
            expect(searchResults.value).toEqual([])

            search('дождь')
            expect(searchResults.value.length).toBeGreaterThan(0)
        })

        it('force: true перестраивает индекс по новым песням', () => {
            const { buildIndex, search, searchResults } = useSongSearch()

            buildIndex(mockSongs)
            buildIndex(otherSongs, { force: true })

            search('зимняя')
            expect(searchResults.value.length).toBeGreaterThan(0)

            search('дождь')
            expect(searchResults.value).toEqual([])
        })

        it('resetSearchIndex обнуляет индексы и разрешает построить заново', () => {
            const { buildIndex, searchIndex, exactIndex } = useSongSearch()

            buildIndex(mockSongs)
            expect(searchIndex.value).not.toBe(null)

            resetSearchIndex()
            expect(searchIndex.value).toBe(null)
            expect(exactIndex.value).toBe(null)

            buildIndex(otherSongs)
            expect(searchIndex.value).not.toBe(null)
        })

        it('запрос и выдача остаются локальными для каждого инстанса', () => {
            const first = useSongSearch()
            const second = useSongSearch()

            first.buildIndex(mockSongs)

            first.searchQuery.value = 'дождь'
            first.search('дождь')

            expect(first.searchResults.value.length).toBeGreaterThan(0)
            expect(second.searchQuery.value).toBe('')
            expect(second.searchResults.value).toEqual([])
        })
    })
})
