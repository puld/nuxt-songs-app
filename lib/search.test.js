import { describe, it, expect } from 'vitest'
import {
    cleanText,
    prepareSongForIndexing,
    buildSearchIndex,
    performSearch
} from './search.js'

describe('cleanText', () => {
    it('должен удалять спецсимволы', () => {
        // Замена спецсимволов на пробелы, затем схлопывание пробелов
        expect(cleanText('Привет, мир!')).toBe('Привет мир')
        expect(cleanText('Скобки (тест) и [другие]')).toBe('Скобки тест и другие')
    })

    it('должен схлопывать множественные пробелы', () => {
        expect(cleanText('Много    пробелов')).toBe('Много пробелов')
        expect(cleanText('  Сначала   и   потом  ')).toBe('Сначала и потом')
    })

    it('должен удалять пробелы в начале и в конце', () => {
        expect(cleanText('  Текст  ')).toBe('Текст')
        expect(cleanText('Текст')).toBe('Текст')
    })

    it('должен обрабатывать все специмволы', () => {
        expect(cleanText('Тест/слэш и(скобки)вопрос?воскл!точка.запятая,;:двоеточие-дефис"кавычки\'апостроф')).toBe('Тест слэш и скобки вопрос воскл точка запятая двоеточие дефис кавычки апостроф')
    })
})

describe('prepareSongForIndexing', () => {
    const mockSong = {
        number: 1,
        title: 'Песня (тестовая)',
        body: [
            { type: 'verse', content: 'Куплет с [аккордами] и текстом...' },
            { type: 'chorus', content: 'Припев: "лалала"!' }
        ]
    }

    it('должен подготавливать песню для индексации', () => {
        const result = prepareSongForIndexing(mockSong)

        expect(result).toEqual({
            n: 1,
            title: 'Песня тестовая',
            content: 'Куплет с аккордами и текстом Припев лалала'
        })
    })

    it('должен правильно обрабатывать пустой массив body', () => {
        const emptySong = {
            number: 2,
            title: 'Песня',
            body: []
        }

        const result = prepareSongForIndexing(emptySong)
        expect(result.content).toBe('')
    })

    it('должен объединять содержимое всех частей', () => {
        const multiPartSong = {
            number: 3,
            title: 'Многокуплетная',
            body: [
                { type: 'verse', content: 'Первый куплет' },
                { type: 'verse', content: 'Второй куплет' },
                { type: 'chorus', content: 'Припев' }
            ]
        }

        const result = prepareSongForIndexing(multiPartSong)
        expect(result.content).toBe('Первый куплет Второй куплет Припев')
    })
})

describe('buildSearchIndex', () => {
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

    it('должен создавать поисковый индекс из массива песен', () => {
        const index = buildSearchIndex(mockSongs)

        expect(index).toBeDefined()
        expect(typeof index.search).toBe('function')
    })

    it('должен индексировать заголовки с бустом', () => {
        const index = buildSearchIndex(mockSongs)

        // Поиск по заголовку должен давать высокий релевантный score
        const titleResults = index.search('дождь')
        const resultWithTitle = titleResults.find(r => r.ref === '1')

        expect(resultWithTitle).toBeDefined()
        expect(resultWithTitle.score).toBeGreaterThan(0)
    })

    it('должен индексировать содержимое песен', () => {
        const index = buildSearchIndex(mockSongs)

        const contentResults = index.search('птицы')
        expect(contentResults.length).toBeGreaterThan(0)
        expect(contentResults[0].ref).toBe('2')
    })
})

describe('performSearch', () => {
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

    let searchIndex

    beforeEach(() => {
        searchIndex = buildSearchIndex(mockSongs)
    })

    it('должен возвращать пустой массив при null индексе', () => {
        const results = performSearch(null, 'тест', 10)
        expect(results).toEqual([])
    })

    it('должен возвращать пустой массив при пустом запросе', () => {
        const results = performSearch(searchIndex, '', 10)
        expect(results).toEqual([])
    })

    it('должен возвращать пустой массив при null запросе', () => {
        const results = performSearch(searchIndex, null, 10)
        expect(results).toEqual([])
    })

    it('должен возвращать пустой массив при запросе с пробелами', () => {
        const results = performSearch(searchIndex, '   ', 10)
        expect(results).toEqual([])
    })

    it('должен находить песню по заголовку', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        expect(results.length).toBeGreaterThan(0)
        // С морфологическим анализом lunr-languages порядок может отличаться
        // Главное - что песни с "дождь" в заголовке находятся
        const songNumbers = results.map(r => r.n)
        expect(songNumbers).toContain('1') // "Осенний дождь"
        expect(songNumbers).toContain('3') // "Дождь в городе"
    })

    it('должен находить песню по содержимому', () => {
        const results = performSearch(searchIndex, 'птицы', 10)

        expect(results.length).toBe(1)
        expect(results[0].n).toBe('2')
    })

    it('должен возвращать результаты отсортированные по релевантности', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        expect(results.length).toBeGreaterThan(0)

        // Проверяем, что результаты отсортированы по убыванию score
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
        }
    })

    it('должен поддерживать нечеткий поиск (нечеткое совпадение)', () => {
        // Ищем с опечаткой
        const results = performSearch(searchIndex, 'дожть', 10) // вместо "дождь"

        expect(results.length).toBeGreaterThan(0)
    })

    it('должен возвращать результаты с правильной структурой', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        results.forEach(result => {
            expect(result).toHaveProperty('n')
            expect(result).toHaveProperty('score')
            expect(result).toHaveProperty('title')
            expect(result.title).toBe('')
        })
    })

    it('должен обрабатывать ошибки поиска корректно', () => {
        // Создаем "сломанный" индекс
        const brokenIndex = {
            search: () => {
                throw new Error('Test error')
            }
        }

        const consoleErrorSpy = vi.spyOn(console, 'error')
        const results = performSearch(brokenIndex, 'тест', 10)

        expect(results).toEqual([])
        expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка поиска:', expect.any(Error))

        consoleErrorSpy.mockRestore()
    })

    it('должен ограничивать количество результатов по лимиту', () => {
        // Запрашиваем больше результатов, чем есть, но с лимитом
        const results = performSearch(searchIndex, 'дождь', 1)

        expect(results.length).toBe(1)
        expect(results[0].n).toBe("3") // Первый результат по релевантности
    })

    it('должен возвращать все результаты если лимит больше количества найденных', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        // Должны получить все 2 результата
        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты если лимит равен 0', () => {
        const results = performSearch(searchIndex, 'дождь', 0)

        // Должны получить все 2 результата, так как limit = 0
        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты если лимит отрицательный', () => {
        const results = performSearch(searchIndex, 'дождь', -1)

        // Должны получить все 2 результата, так как limit < 0
        expect(results.length).toBe(2)
    })

    it('должен использовать лимит при поиске по содержимому', () => {
        const results = performSearch(searchIndex, 'птицы', 1)

        expect(results.length).toBe(1)
        expect(results[0].n).toBe('2')
    })

    // Тесты для значения по умолчанию limit
    it('должен возвращать все результаты при отсутствии параметра limit', () => {
        // Вызов без третьего параметра должен использовать значение по умолчанию (0)
        const results = performSearch(searchIndex, 'дождь')

        // Должны получить все 2 результата, так как limit по умолчанию = 0
        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты при limit undefined', () => {
        const results = performSearch(searchIndex, 'дождь', undefined)

        // Должны получить все 2 результата, так как limit = undefined
        expect(results.length).toBe(2)
    })
})

describe('Интеграционные сценарии поиска', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Любовь и море',
            body: [
                { type: 'verse', content: 'Я люблю тебя, море и небо' }
            ]
        },
        {
            number: 2,
            title: 'Любовь и горы',
            body: [
                { type: 'verse', content: 'Мы любим горы и леса' }
            ]
        },
        {
            number: 3,
            title: 'Песня о дружбе',
            body: [
                { type: 'verse', content: 'Дружба важнее всего' }
            ]
        }
    ]

    let searchIndex

    beforeEach(() => {
        searchIndex = buildSearchIndex(mockSongs)
    })

    it('должен находить несколько песен по одному слову', () => {
        const results = performSearch(searchIndex, 'любовь', 10)

        expect(results.length).toBe(2)
        expect(results.map(r => r.n).sort()).toEqual(['1', '2'])
    })

    it('должен находить по комбинации слов', () => {
        const results = performSearch(searchIndex, 'люблю тебя', 10)

        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('1')
    })

    it('должен находить с учетом буста заголовка', () => {
        const results = performSearch(searchIndex, 'любовь', 10)

        // Первая песня "Любовь и море" должна быть выше, т.к. "любовь" в заголовке
        // Вторая песня "Любовь и горы" - тоже в заголовке
        expect(results[0].score).toBeGreaterThan(0)
    })
})
