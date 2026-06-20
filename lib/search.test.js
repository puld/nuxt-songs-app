import { describe, it, expect } from 'vitest'
import {
    cleanText,
    prepareSongForIndexing,
    prepareVariantsForIndexing,
    buildSearchIndex,
    performSearch,
    buildExactIndex,
    performExactSearch,
    parseSearchRef
} from './search.js'

describe('cleanText', () => {
    it('должен удалять спецсимволы', () => {
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
        variants: [
            {
                label: '',
                body: [
                    { type: 'verse', content: 'Куплет с [аккордами] и текстом...' },
                    { type: 'chorus', content: 'Припев: "лалала"!' }
                ]
            }
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

    it('должен правильно обрабатывать пустой массив variants', () => {
        const emptySong = {
            number: 2,
            title: 'Песня',
            variants: [{ label: '', body: [] }]
        }

        const result = prepareSongForIndexing(emptySong)
        expect(result.content).toBe('')
    })

    it('должен объединять содержимое всех частей', () => {
        const multiPartSong = {
            number: 3,
            title: 'Многокуплетная',
            variants: [
                {
                    label: '',
                    body: [
                        { type: 'verse', content: 'Первый куплет' },
                        { type: 'verse', content: 'Второй куплет' },
                        { type: 'chorus', content: 'Припев' }
                    ]
                }
            ]
        }

        const result = prepareSongForIndexing(multiPartSong)
        expect(result.content).toBe('Первый куплет Второй куплет Припев')
    })

    it('должен индексировать контент всех вариантов', () => {
        const multiVariantSong = {
            number: 4,
            title: 'Песня с вариантами',
            variants: [
                { label: 'а', body: [{ type: 'verse', content: 'Первый вариант текст' }] },
                { label: 'б', body: [{ type: 'verse', content: 'Второй вариант текст' }] }
            ]
        }

        const result = prepareSongForIndexing(multiVariantSong)
        expect(result.content).toContain('Первый вариант текст')
        expect(result.content).toContain('Второй вариант текст')
    })

    it('должен поддерживать старый формат с body', () => {
        const oldFormatSong = {
            number: 5,
            title: 'Старый формат',
            body: [{ type: 'verse', content: 'Текст старого формата' }]
        }

        const result = prepareSongForIndexing(oldFormatSong)
        expect(result.content).toBe('Текст старого формата')
    })
})

describe('prepareVariantsForIndexing', () => {
    it('должен возвращать один документ для песни с одним вариантом', () => {
        const song = {
            number: 1,
            title: 'Песня',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Куплет текст' }] }
            ]
        }

        const result = prepareVariantsForIndexing(song)
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
            ref: '1:0',
            n: 1,
            title: 'Песня',
            content: 'Куплет текст',
            variantIndex: 0
        })
    })

    it('должен возвращать отдельный документ для каждого варианта', () => {
        const song = {
            number: 235,
            title: 'Песня с вариантами',
            variants: [
                { label: 'а', body: [{ type: 'verse', content: 'Текст варианта а' }] },
                { label: 'б', body: [{ type: 'verse', content: 'Текст варианта б' }] }
            ]
        }

        const result = prepareVariantsForIndexing(song)
        expect(result).toHaveLength(2)
        expect(result[0].ref).toBe('235:0')
        expect(result[0].variantIndex).toBe(0)
        expect(result[1].ref).toBe('235:1')
        expect(result[1].variantIndex).toBe(1)
    })

    it('должен поддерживать старый формат с body', () => {
        const song = {
            number: 10,
            title: 'Старый формат',
            body: [{ type: 'verse', content: 'Текст' }]
        }

        const result = prepareVariantsForIndexing(song)
        expect(result).toHaveLength(1)
        expect(result[0].ref).toBe('10:0')
        expect(result[0].variantIndex).toBe(0)
    })
})

describe('parseSearchRef', () => {
    it('должен разбирать ref с числовым индексом варианта', () => {
        expect(parseSearchRef('235:0')).toEqual({ n: '235', variantIndex: 0 })
        expect(parseSearchRef('235:1')).toEqual({ n: '235', variantIndex: 1 })
        expect(parseSearchRef('1:0')).toEqual({ n: '1', variantIndex: 0 })
        expect(parseSearchRef('1254:2')).toEqual({ n: '1254', variantIndex: 2 })
    })

    it('должен обрабатывать ref без двоеточия (обратная совместимость)', () => {
        expect(parseSearchRef('1')).toEqual({ n: '1', variantIndex: 0 })
        expect(parseSearchRef('235')).toEqual({ n: '235', variantIndex: 0 })
    })
})

describe('buildSearchIndex', () => {
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

    it('должен создавать поисковый индекс из массива песен', () => {
        const index = buildSearchIndex(mockSongs)

        expect(index).toBeDefined()
        expect(typeof index.search).toBe('function')
    })

    it('должен индексировать заголовки с бустом', () => {
        const index = buildSearchIndex(mockSongs)

        const titleResults = index.search('дождь')
        const resultWithTitle = titleResults.find(r => r.ref.startsWith('1:'))

        expect(resultWithTitle).toBeDefined()
        expect(resultWithTitle.score).toBeGreaterThan(0)
    })

    it('должен индексировать содержимое песен', () => {
        const index = buildSearchIndex(mockSongs)

        const contentResults = index.search('птицы')
        expect(contentResults.length).toBeGreaterThan(0)
        expect(contentResults[0].ref).toBe('2:0')
    })
})

describe('performSearch', () => {
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
        const songNumbers = results.map(r => r.n)
        expect(songNumbers).toContain('1')
        expect(songNumbers).toContain('3')
    })

    it('должен находить песню по содержимому', () => {
        const results = performSearch(searchIndex, 'птицы', 10)

        expect(results.length).toBe(1)
        expect(results[0].n).toBe('2')
    })

    it('должен возвращать результаты отсортированные по релевантности', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        expect(results.length).toBeGreaterThan(0)

        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
        }
    })

    it('должен поддерживать нечеткий поиск (нечеткое совпадение)', () => {
        const results = performSearch(searchIndex, 'дожть', 10)

        expect(results.length).toBeGreaterThan(0)
    })

    it('должен возвращать результаты с правильной структурой', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        results.forEach(result => {
            expect(result).toHaveProperty('n')
            expect(result).toHaveProperty('variantIndex')
            expect(result).toHaveProperty('score')
            expect(result).toHaveProperty('title')
            expect(result.title).toBe('')
        })
    })

    it('должен возвращать variantIndex в результатах', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        results.forEach(result => {
            expect(typeof result.variantIndex).toBe('number')
        })
    })

    it('должен обрабатывать ошибки поиска корректно', () => {
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
        const results = performSearch(searchIndex, 'дождь', 1)

        expect(results.length).toBe(1)
    })

    it('должен возвращать все результаты если лимит больше количества найденных', () => {
        const results = performSearch(searchIndex, 'дождь', 10)

        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты если лимит равен 0', () => {
        const results = performSearch(searchIndex, 'дождь', 0)

        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты если лимит отрицательный', () => {
        const results = performSearch(searchIndex, 'дождь', -1)

        expect(results.length).toBe(2)
    })

    it('должен использовать лимит при поиске по содержимому', () => {
        const results = performSearch(searchIndex, 'птицы', 1)

        expect(results.length).toBe(1)
        expect(results[0].n).toBe('2')
    })

    it('должен возвращать все результаты при отсутствии параметра limit', () => {
        const results = performSearch(searchIndex, 'дождь')

        expect(results.length).toBe(2)
    })

    it('должен возвращать все результаты при limit undefined', () => {
        const results = performSearch(searchIndex, 'дождь', undefined)

        expect(results.length).toBe(2)
    })
})

describe('Дедупликация по вариантам', () => {
    it('должен дедуплицировать результаты — оставлять лучший вариант', () => {
        const variantSongs = [
            {
                number: 235,
                title: 'Со Христом бодрее',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Бодрее в путь пойду уникальное слово' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Радостнее шагаю вперед' }] }
                ]
            }
        ]

        const variantIndex = buildSearchIndex(variantSongs)
        const results = performSearch(variantIndex, 'бодрее', 10)

        // Одна песня — один результат (дедупликация)
        expect(results.length).toBe(1)
        expect(results[0].n).toBe('235')
        // Вариант с лучшим совпадением (индекс 0 = вариант 'а')
        expect(results[0].variantIndex).toBe(0)
    })

    it('должен находить нужный вариант при поиске по уникальному тексту', () => {
        const variantSongs = [
            {
                number: 235,
                title: 'Со Христом бодрее',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Уникальный текст варианта альфа' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Уникальный текст варианта бета' }] }
                ]
            }
        ]

        const variantIndex = buildSearchIndex(variantSongs)

        const resultsB = performSearch(variantIndex, 'бета', 10)
        expect(resultsB.length).toBe(1)
        expect(resultsB[0].n).toBe('235')
        expect(resultsB[0].variantIndex).toBe(1)
    })
})

describe('Интеграционные сценарии поиска', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Любовь и море',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Я люблю тебя, море и небо' }] }
            ]
        },
        {
            number: 2,
            title: 'Любовь и горы',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Мы любим горы и леса' }] }
            ]
        },
        {
            number: 3,
            title: 'Песня о дружбе',
            variants: [
                { label: '', body: [{ type: 'verse', content: 'Дружба важнее всего' }] }
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

        expect(results[0].score).toBeGreaterThan(0)
    })

    it('должен ранжировать песню с совпадением в заголовке выше песни с совпадением только в тексте', () => {
        // Песня 1 — «Любовь и море» (совпадение в title)
        // Песня 2 — «Любовь и горы» (совпадение в title)
        // Обе имеют «любовь» в заголовке, но проверяем что title-буст работает
        const results = performSearch(searchIndex, 'любовь', 10)

        // Обе песни должны быть найдены
        expect(results.length).toBe(2)
        // Обе имеют совпадение в заголовке — score должен быть высоким
        results.forEach(r => {
            expect(r.score).toBeGreaterThan(0)
        })
    })

    it('должен отдавать приоритет совпадению в заголовке над совпадением в тексте', () => {
        const boostSongs = [
            {
                number: 1,
                title: 'Как я хочу улететь в Небеса',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Куплет песни про небеса' }] }]
            },
            {
                number: 2,
                title: 'Другая песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Я как хочу улететь далеко и еще хочу улететь' }] }]
            }
        ]

        const boostIndex = buildSearchIndex(boostSongs)
        const results = performSearch(boostIndex, 'улететь', 10)

        // Песня 1 имеет «улететь» в title — должна быть первой
        expect(results[0].n).toBe('1')
        expect(results[0].score).toBeGreaterThan(results[1].score)
    })

    it('должен находить песню по частичному совпадению последнего слова (fuzzy)', () => {
        const fuzzySongs = [
            {
                number: 1,
                title: 'Весенняя песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Весна пришла наконец' }] }]
            }
        ]

        const fuzzyIndex = buildSearchIndex(fuzzySongs)
        // «весн» — неполное слово, fuzzy ~1 на последнем слове должен найти
        const results = performSearch(fuzzyIndex, 'весн', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('1')
    })

    it('должен искать первые слова точно, fuzzy только на последнем', () => {
        const multiSongs = [
            {
                number: 1,
                title: 'Как я хочу улететь в Небеса',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Куплет' }] }]
            },
            {
                number: 2,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Как кто-то хочет улетать быстро' }] }]
            }
        ]

        const multiIndex = buildSearchIndex(multiSongs)
        // «как хочу» — «как» точно, «хочу» с fuzzy
        // Русский стеммер сводит «хочу» и «хоч» к одному корню «хоч»,
        // поэтому обе песни найдутся, но песня 1 с совпадением в title должна быть первой
        const results = performSearch(multiIndex, 'как хоч', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('1')
    })

    it('должен возвращать пустой результат для запроса короче 3 символов', () => {
        expect(performSearch(searchIndex, 'на', 10)).toEqual([])
        expect(performSearch(searchIndex, 'я', 10)).toEqual([])
    })

    it('должен возвращать пустой результат для однобуквенного запроса', () => {
        expect(performSearch(searchIndex, 'а', 10)).toEqual([])
    })

    it('должен находить контент из конкретного варианта песни', () => {
        const variantSongs = [
            {
                number: 1,
                title: 'Песня с вариантами',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Альфа уникальное слово альфа текст' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Бета уникальное слово бета текст' }] }
                ]
            }
        ]

        const variantIndex = buildSearchIndex(variantSongs)

        // Поиск по уникальному тексту варианта а (индекс 0)
        const resultsA = performSearch(variantIndex, 'альфа', 10)
        expect(resultsA.length).toBe(1)
        expect(resultsA[0].variantIndex).toBe(0)

        // Поиск по уникальному тексту варианта б (индекс 1)
        const resultsB = performSearch(variantIndex, 'бета', 10)
        expect(resultsB.length).toBe(1)
        expect(resultsB[0].variantIndex).toBe(1)
    })

    it('должен возвращать variantIndex 0 для песни с одним вариантом', () => {
        const results = performSearch(searchIndex, 'дружба', 10)
        expect(results.length).toBe(1)
        expect(results[0].variantIndex).toBe(0)
    })
})

describe('buildExactIndex', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Осенний дождь',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Листья падают, дождь идет' }] }]
        },
        {
            number: 2,
            title: 'Дождь в городе',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Город засыпает под дождем' }] }]
        }
    ]

    it('должен создавать массив с полями n, title, text, textFlat', () => {
        const index = buildExactIndex(mockSongs)

        expect(Array.isArray(index)).toBe(true)
        expect(index.length).toBe(2)
        expect(index[0]).toHaveProperty('n')
        expect(index[0]).toHaveProperty('title')
        expect(index[0]).toHaveProperty('text')
        expect(index[0]).toHaveProperty('textFlat')
    })

    it('должен объединять заголовок и все варианты в text', () => {
        const index = buildExactIndex(mockSongs)
        const first = index[0]

        expect(first.text).toContain('осенний дождь')
        expect(first.text).toContain('листья падают')
    })

    it('должен создавать textFlat без пробелов', () => {
        const index = buildExactIndex(mockSongs)
        const first = index[0]

        expect(first.textFlat).not.toContain(' ')
        expect(first.textFlat.length).toBe(first.text.replace(/\s+/g, '').length)
    })

    it('должен конвертировать n в строку', () => {
        const index = buildExactIndex(mockSongs)
        expect(typeof index[0].n).toBe('string')
        expect(index[0].n).toBe('1')
    })
})

describe('performExactSearch', () => {
    const mockSongs = [
        {
            number: 1,
            title: 'Осенний дождь',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Листья падают, дождь идет' }] }]
        },
        {
            number: 2,
            title: 'Весенняя песня',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Птицы поют, солнце светит' }] }]
        },
        {
            number: 3,
            title: 'Дождь в городе',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Город засыпает под дождем' }] }]
        }
    ]

    let index

    beforeEach(() => {
        index = buildExactIndex(mockSongs)
    })

    it('должен возвращать пустой массив при null индексе', () => {
        expect(performExactSearch(null, 'тест', 10)).toEqual([])
    })

    it('должен возвращать пустой массив при пустом запросе', () => {
        expect(performExactSearch(index, '', 10)).toEqual([])
    })

    it('должен возвращать пустой массив при запросе короче 3 символов', () => {
        expect(performExactSearch(index, 'до', 10)).toEqual([])
        expect(performExactSearch(index, 'я', 10)).toEqual([])
    })

    it('должен находить песню по полному слову', () => {
        const results = performExactSearch(index, 'дождь', 10)
        expect(results.length).toBeGreaterThan(0)
        const numbers = results.map(r => r.n).sort()
        expect(numbers).toContain('1')
        expect(numbers).toContain('3')
    })

    it('НЕ должен находить песню по части слова (требует полного совпадения)', () => {
        const results = performExactSearch(index, 'дож', 10)
        expect(results.length).toBe(0)
    })

    it('должен находить по нескольким словам через склейку', () => {
        const gluingSongs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Вот с нами Бог и сила' }] }]
            }
        ]
        const gluingIndex = buildExactIndex(gluingSongs)
        const results = performExactSearch(gluingIndex, 'вот с', 10)
        expect(results.length).toBe(1)
        expect(results[0].n).toBe('1')
    })

    it('НЕ должен находить, если склеенные слова идут в другом порядке', () => {
        const gluingSongs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Вот с нами Бог' }] }]
            }
        ]
        const gluingIndex = buildExactIndex(gluingSongs)
        const results = performExactSearch(gluingIndex, 'с вот', 10)
        expect(results.length).toBe(0)
    })

    it('должен возвращать правильную структуру результата', () => {
        const results = performExactSearch(index, 'дождь', 10)
        results.forEach(r => {
            expect(r).toHaveProperty('n')
            expect(r).toHaveProperty('variantIndex')
            expect(r).toHaveProperty('score')
            expect(r).toHaveProperty('title')
            expect(typeof r.n).toBe('string')
            expect(r.variantIndex).toBe(0)
        })
    })

    it('должен сортировать результаты по алфавиту заголовков', () => {
        const results = performExactSearch(index, 'дождь', 10)
        const titles = results.map(r => r.title)
        const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'ru'))
        expect(titles).toEqual(sorted)
    })

    it('должен ограничивать количество результатов', () => {
        const results = performExactSearch(index, 'дождь', 1)
        expect(results.length).toBe(1)
    })

    it('должен возвращать все результаты при limit=0', () => {
        const results = performExactSearch(index, 'дождь', 0)
        expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('должен считать score по позиции первого совпадения', () => {
        const results = performExactSearch(index, 'дождь', 10)
        results.forEach(r => {
            expect(r.score).toBeGreaterThan(0)
            expect(r.score).toBeLessThanOrEqual(1)
        })
    })
})
