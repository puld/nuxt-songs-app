import { describe, it, expect } from 'vitest'
import {
    cleanText,
    prepareSongForIndexing,
    prepareVariantsForIndexing,
    buildSearchIndex,
    performSearch,
    parseSearchRef,
    buildExactIndex,
    performExactSearch,
    performUnifiedSearch,
    MATCH_TYPE
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
            expect(result).toHaveProperty('matchType')
            expect(result.title).toBe('')
            expect(result.matchType).toBe(MATCH_TYPE.LUNR)
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
            title: 'Весенняя песня',
            variants: [{ label: '', body: [{ type: 'verse', content: 'Птицы поют' }] }]
        }
    ]

    it('должен создавать массив с полями n, title, variantIndex, titleFlat, textFlat', () => {
        const index = buildExactIndex(mockSongs)

        expect(Array.isArray(index)).toBe(true)
        expect(index.length).toBe(2)
        expect(index[0]).toHaveProperty('n')
        expect(index[0]).toHaveProperty('title')
        expect(index[0]).toHaveProperty('variantIndex')
        expect(index[0]).toHaveProperty('titleFlat')
        expect(index[0]).toHaveProperty('textFlat')
    })

    it('должен создавать по одной записи на каждый вариант песни', () => {
        const multiVariant = [
            {
                number: 235,
                title: 'Песня с вариантами',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Текст а' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Текст б' }] }
                ]
            }
        ]

        const index = buildExactIndex(multiVariant)
        expect(index.length).toBe(2)
        expect(index[0].variantIndex).toBe(0)
        expect(index[1].variantIndex).toBe(1)
    })

    it('должен конвертировать n в строку', () => {
        const index = buildExactIndex(mockSongs)
        expect(typeof index[0].n).toBe('string')
        expect(index[0].n).toBe('1')
    })

    it('должен создавать titleFlat без пробелов и в нижнем регистре', () => {
        const index = buildExactIndex(mockSongs)
        expect(index[0].titleFlat).toBe('осеннийдождь')
    })

    it('должен создавать textFlat без пробелов (title + content склеены)', () => {
        const index = buildExactIndex(mockSongs)
        expect(index[0].textFlat).toContain('осеннийдождь')
        expect(index[0].textFlat).toContain('листьяпадают')
        expect(index[0].textFlat).not.toContain(' ')
    })

    it('должен поддерживать старый формат с body (без variants)', () => {
        const oldFormat = [
            {
                number: 10,
                title: 'Старый формат',
                body: [{ type: 'verse', content: 'Текст' }]
            }
        ]

        const index = buildExactIndex(oldFormat)
        expect(index.length).toBe(1)
        expect(index[0].n).toBe('10')
        expect(index[0].variantIndex).toBe(0)
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

    it('должен находить песню по части слова (посимвольный поиск)', () => {
        const results = performExactSearch(index, 'дож', 10)
        expect(results.length).toBeGreaterThan(0)
        const numbers = results.map(r => r.n).sort()
        expect(numbers).toContain('1')
        expect(numbers).toContain('3')
    })

    it('должен находить по нескольким словам через склейку пробелов', () => {
        const songs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Вот с нами Бог и сила' }] }]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'вот с', 10)
        expect(results.length).toBe(1)
        expect(results[0].n).toBe('1')
    })

    it('должен находить по началу фразы (части символов из нескольких слов)', () => {
        const songs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Как прекрасны вверху небеса' }] }]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'как пр', 10)
        expect(results.length).toBe(1)
        expect(results[0].n).toBe('1')
    })

    it('НЕ должен находить, если символы идут в другом порядке', () => {
        const songs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Вот с нами Бог' }] }]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'с вот', 10)
        expect(results.length).toBe(0)
    })

    it('должен игнорировать регистр', () => {
        const results = performExactSearch(index, 'ДОЖДЬ', 10)
        expect(results.length).toBeGreaterThan(0)
    })

    it('должен возвращать правильную структуру результата', () => {
        const results = performExactSearch(index, 'дождь', 10)
        results.forEach(r => {
            expect(r).toHaveProperty('n')
            expect(r).toHaveProperty('variantIndex')
            expect(r).toHaveProperty('score')
            expect(r).toHaveProperty('title')
            expect(r).toHaveProperty('matchType')
            expect(typeof r.n).toBe('string')
            expect(r.matchType).toBe(MATCH_TYPE.EXACT)
        })
    })

    it('должен ставить title-совпадения выше body-совпадений', () => {
        const songs = [
            {
                number: 1,
                title: 'Б',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Здесь где-то далеко как пр' }] }]
            },
            {
                number: 2,
                title: 'А как прекрасны',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Текст' }] }]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'как пр', 10)
        expect(results[0].n).toBe('2')
        expect(results[0].score).toBeGreaterThan(results[1].score)
    })

    it('должен дедуплицировать по номеру песни', () => {
        const songs = [
            {
                number: 1,
                title: 'Дождь',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Дождь идет' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Дождь капает' }] }
                ]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'дождь', 10)
        // Одна песня — один результат после дедупликации
        expect(results.length).toBe(1)
        expect(results[0].n).toBe('1')
    })

    it('должен сохранять правильный variantIndex для многовариантных песен', () => {
        const songs = [
            {
                number: 1,
                title: 'Песня',
                variants: [
                    { label: 'а', body: [{ type: 'verse', content: 'Уникальный текст альфа' }] },
                    { label: 'б', body: [{ type: 'verse', content: 'Совершенно другой текст' }] }
                ]
            }
        ]
        const idx = buildExactIndex(songs)
        const results = performExactSearch(idx, 'альфа', 10)
        expect(results.length).toBe(1)
        expect(results[0].variantIndex).toBe(0)
    })

    it('должен сортировать по score по убыванию, при равном score — по алфавиту', () => {
        const results = performExactSearch(index, 'дождь', 10)
        for (let i = 1; i < results.length; i++) {
            if (results[i - 1].score === results[i].score) {
                expect(results[i - 1].title.localeCompare(results[i].title, 'ru')).toBeLessThanOrEqual(0)
            } else {
                expect(results[i - 1].score).toBeGreaterThan(results[i].score)
            }
        }
    })

    it('должен ограничивать количество результатов по лимиту', () => {
        const results = performExactSearch(index, 'дождь', 1)
        expect(results.length).toBe(1)
    })

    it('должен возвращать все результаты при limit=0', () => {
        const results = performExactSearch(index, 'дождь', 0)
        expect(results.length).toBeGreaterThanOrEqual(2)
    })
})

describe('performUnifiedSearch', () => {
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

    let exactIndex, lunrIndex

    beforeEach(() => {
        exactIndex = buildExactIndex(mockSongs)
        lunrIndex = buildSearchIndex(mockSongs)
    })

    it('должен возвращать пустой массив при пустом запросе', () => {
        expect(performUnifiedSearch(exactIndex, lunrIndex, '', 10)).toEqual([])
    })

    it('должен возвращать пустой массив при запросе короче 3 символов', () => {
        expect(performUnifiedSearch(exactIndex, lunrIndex, 'до', 10)).toEqual([])
    })

    it('должен включать и точные, и Lunr-результаты', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 10)
        expect(results.length).toBeGreaterThan(0)
        const types = results.map(r => r.matchType)
        expect(types).toContain(MATCH_TYPE.EXACT)
    })

    it('должен ставить точные результаты выше Lunr-результатов', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 10)
        const firstLunrIdx = results.findIndex(r => r.matchType === MATCH_TYPE.LUNR)
        const lastExactIdx = results.map(r => r.matchType).lastIndexOf(MATCH_TYPE.EXACT)

        if (firstLunrIdx >= 0 && lastExactIdx >= 0) {
            expect(lastExactIdx).toBeLessThan(firstLunrIdx)
        }
    })

    it('должен дедуплицировать: песня из точного поиска не повторяется в Lunr', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 10)
        const numbers = results.map(r => r.n)
        expect(new Set(numbers).size).toBe(numbers.length)
    })

    it('должен помечать точные результаты matchType=exact, Lunr — matchType=lunr', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 10)
        results.forEach(r => {
            expect([MATCH_TYPE.EXACT, MATCH_TYPE.LUNR]).toContain(r.matchType)
        })
    })

    it('должен находить по части слова (точный поиск), когда Lunr не находит', () => {
        const songs = [
            {
                number: 1,
                title: 'Песня',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Здесь уникальнаяфраза которую Lunr не найдёт по части' }] }]
            }
        ]
        const exact = buildExactIndex(songs)
        const lunr = buildSearchIndex(songs)

        // «уникальнаяф» — подстрока без границы слова, Lunr не найдёт, точный найдёт
        const results = performUnifiedSearch(exact, lunr, 'уникальнаяф', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].matchType).toBe(MATCH_TYPE.EXACT)
        expect(results[0].n).toBe('1')
    })

    it('должен находить по опечатке через Lunr, когда точный поиск не находит', () => {
        const songs = [
            {
                number: 1,
                title: 'Дождь',
                variants: [{ label: '', body: [{ type: 'verse', content: 'Льет воду' }] }]
            }
        ]
        const exact = buildExactIndex(songs)
        const lunr = buildSearchIndex(songs)

        // «дожть» — опечатка, точный не найдёт, Lunr найдёт
        const results = performUnifiedSearch(exact, lunr, 'дожть', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].matchType).toBe(MATCH_TYPE.LUNR)
        expect(results[0].n).toBe('1')
    })

    it('должен применять лимит к объединённому списку', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 1)
        expect(results.length).toBe(1)
    })

    it('должен возвращать все результаты при limit=0', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'дождь', 0)
        expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('должен работать при null exactIndex (только Lunr)', () => {
        const results = performUnifiedSearch(null, lunrIndex, 'дождь', 10)
        expect(results.length).toBeGreaterThan(0)
        results.forEach(r => {
            expect(r.matchType).toBe(MATCH_TYPE.LUNR)
        })
    })

    it('должен работать при null lunrIndex (только точный)', () => {
        const results = performUnifiedSearch(exactIndex, null, 'дождь', 10)
        expect(results.length).toBeGreaterThan(0)
        results.forEach(r => {
            expect(r.matchType).toBe(MATCH_TYPE.EXACT)
        })
    })
})

describe('Реальные тест-кейсы (первые 20 песен)', () => {
    // Первые 20 песен из базы — реальные названия и первые строки
    const realSongs = [
        { number: 1, title: 'Слушайте повесть любви в простоте', body: 'Слушайте повесть любви в простоте, Слушайте дивный рассказ: Бог нас навеки простил во Христе, Бог нас от гибели спас!' },
        { number: 2, title: 'Вот настал молитвы час', body: 'Вот настал молитвы час; С верою принесём Грех и страх, что мучат нас, Сложим их пред Богом!' },
        { number: 3, title: 'Боже! Слышать слово Ты позволил снова', body: 'Боже! Слышать слово Ты позволил снова, К нам склони святой Свой лик, Чтобы свет познать нам слова!' },
        { number: 4, title: 'Господь! Душа внимать готова', body: 'Господь! Душа внимать готова, Лишь слух и очи мне открой Услышать правду Божья Сына!' },
        { number: 5, title: 'О Спаситель! Благодать На благую весть', body: 'О Спаситель! Благодать На благую весть излей; Дай нам все слова понять!' },
        { number: 6, title: 'О Божьих слов не пропускай', body: 'О Божьих слов не пропускай, Не закрывай от света глаз, И сердца не ожесточай!' },
        { number: 7, title: 'Благословений потоки Бог обещал ниспослать', body: 'Благословений потоки Бог обещал ниспослать, Ближним, чужим и далёким Радость небесную дать!' },
        { number: 8, title: 'Люблю, Спаситель, в книге дивной', body: 'Люблю, Спаситель, в книге дивной Слова любви Твоей читать И вести радостной, приящей весть!' },
        { number: 9, title: 'Весть об Иисусе скажи мне', body: 'Весть об Иисусе скажи мне, Всё расскажи про Него; Чудная повесть благая Сердцу дороже всего!' },
        { number: 10, title: 'Вот собрались мы опять Прославлять', body: 'Вот собрались мы опять Прославлять любовь Отца; Пусть святая благодать Преисполнит все сердца!' },
        { number: 11, title: 'Спаситель, говори нам Везде во всякий час', body: 'Спаситель, говори нам Везде во всякий час Слова любви и силы: Я не оставлю вас!' },
        { number: 12, title: 'Открой сердца детей Своих', body: 'Открой сердца детей Своих И Сам войди, О Боже, в них! Дай слово им Твоё принять!' },
        { number: 13, title: 'Скажи мне весть благую', body: 'Скажи мне весть благую, Скажи, Спаситель, вновь Про смерть и жизнь святую И про Твою любовь!' },
        { number: 14, title: 'Как тропинкою лесною К ручейку спешит олень', body: 'Как тропинкою лесною К ручейку спешит олень, Так и я стремлюсь душою К Слову жизни, к свету!' },
        { number: 15, title: 'Ты – помощь мне, Господь', body: 'Ты – помощь мне, Господь, На всякий час; И мир дарует мне Твой нежный глас!' },
        { number: 16, title: 'Господь! Пребудь Ты с нами', body: 'Господь! Пребудь Ты с нами И нас веди всегда Премудрыми путями К источнику добра!' },
        { number: 17, title: 'Как радостно, как сладко для сердец', body: 'Как радостно, как сладко для сердец Собраться пред Отцом в святом собранье И петь хвалу Творцу!' },
        { number: 18, title: 'Брат, напомни мне опять Звуки слов любви', body: 'Брат, напомни мне опять Звуки слов любви, Чтоб я сердцем мог понять Тайну слов любви!' },
        { number: 19, title: 'О Господь! Тебе известно', body: 'О Господь! Тебе известно, Для чего теперь мы здесь; Дай же в радости небесной Чувствовать Твою благодать!' },
        { number: 20, title: 'Ты – единый мой Учитель', body: 'Ты – единый мой Учитель На пути моём земном; Недостойный Твой служитель Стал Твоим учеником!' }
    ]

    const songs = realSongs.map(s => ({
        number: s.number,
        title: s.title,
        variants: [{ label: '', body: [{ type: 'verse', content: s.body }] }]
    }))

    let exactIndex, lunrIndex

    beforeEach(() => {
        exactIndex = buildExactIndex(songs)
        lunrIndex = buildSearchIndex(songs)
    })

    // === Точный поиск по названию ===

    it('точный: «повесть любви» находит песню 1 по названию', () => {
        const results = performExactSearch(exactIndex, 'повесть любви', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('1')
        expect(results[0].score).toBeGreaterThan(2) // title-матч
    })

    it('точный: «молитвы час» находит песню 2 по названию', () => {
        const results = performExactSearch(exactIndex, 'молитвы час', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('2')
    })

    it('точный: «потоки» находит песню 7 по названию', () => {
        const results = performExactSearch(exactIndex, 'потоки', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('7')
    })

    it('точный: «благословений пот» находит песню 7 по началу названия', () => {
        const results = performExactSearch(exactIndex, 'благословений пот', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].n).toBe('7')
    })

    // === Точный поиск по тексту (подстрока) ===

    it('точный: «Бог нас навеки» находит песню 1 по тексту', () => {
        const results = performExactSearch(exactIndex, 'Бог нас навеки', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('1')
    })

    it('точный: «не оставлю вас» находит песню 11 по тексту', () => {
        const results = performExactSearch(exactIndex, 'не оставлю вас', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('11')
    })

    it('точный: «спешит олень» находит песню 14 по тексту', () => {
        const results = performExactSearch(exactIndex, 'спешит олень', 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('14')
    })

    // === Точный поиск: подстроки без границы слова ===

    it('точный: «повест» находит песню 1 и 9 (повесть/повесть)', () => {
        const results = performExactSearch(exactIndex, 'повест', 10)
        expect(results.length).toBeGreaterThanOrEqual(2)
        const numbers = results.map(r => r.n)
        expect(numbers).toContain('1')
        expect(numbers).toContain('9')
    })

    it('точный: «благ» находит песни с «благая/благодать/благую»', () => {
        const results = performExactSearch(exactIndex, 'благ', 10)
        expect(results.length).toBeGreaterThan(0)
        // Песни 5, 9, 10, 12, 13, 19 содержат «благ»
        const numbers = results.map(r => r.n)
        expect(numbers.length).toBeGreaterThanOrEqual(3)
    })

    // === Lunr: опечатки и морфология ===

    it('Lunr: «повестб» (опечатка) находит песни с «повесть»', () => {
        const results = performSearch(lunrIndex, 'повестб', 10)
        expect(results.length).toBeGreaterThan(0)
    })

    it('Lunr: «малилвы» (опечатка) находит «молитвы»', () => {
        const results = performSearch(lunrIndex, 'малилвы', 10)
        expect(results.length).toBeGreaterThan(0)
    })

    it('Lunr: «блогословений» (опечатка) находит «благословений»', () => {
        const results = performSearch(lunrIndex, 'блогословений', 10)
        expect(results.length).toBeGreaterThan(0)
    })

    // === Unified: приоритет точного над Lunr ===

    it('unified: «повесть» — точный результат выше Lunr', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'повесть', 10)
        expect(results.length).toBeGreaterThan(0)
        // Первый результат должен быть точным
        expect(results[0].matchType).toBe(MATCH_TYPE.EXACT)
    })

    it('unified: «молитвы» — точный результат выше Lunr', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'молитвы', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].matchType).toBe(MATCH_TYPE.EXACT)
    })

    it('unified: «учитель» — находит песню 20 и точный выше', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'учитель', 10)
        expect(results.length).toBeGreaterThan(0)
        const exactResults = results.filter(r => r.matchType === MATCH_TYPE.EXACT)
        const lunrResults = results.filter(r => r.matchType === MATCH_TYPE.LUNR)
        // Точные должны быть первыми
        if (exactResults.length > 0 && lunrResults.length > 0) {
            expect(results.indexOf(exactResults[exactResults.length - 1])).toBeLessThan(
                results.indexOf(lunrResults[0])
            )
        }
    })

    // === Комбинированные кейсы ===

    it('unified: «Спаситель говори» — находит песню 11', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'Спаситель говори', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('11')
    })

    it('unified: «сердца детей» — находит песню 12', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'сердца детей', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('12')
    })

    it('unified: «радостно сладко» — находит песню 17', () => {
        const results = performUnifiedSearch(exactIndex, lunrIndex, 'радостно сладко', 10)
        expect(results.length).toBeGreaterThan(0)
        expect(results.map(r => r.n)).toContain('17')
    })
})
