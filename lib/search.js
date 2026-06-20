import lunr from 'lunr'
import lunrStemmerSupport from 'lunr-languages/lunr.stemmer.support'
import lunrRu from 'lunr-languages/lunr.ru'

// Подключаем stemmer перед языковыми плагинами
lunrStemmerSupport(lunr)

// Регистрируем русский язык в Lunr
lunrRu(lunr)

/**
 * Очищает текст от спецсимволов и нормализует пробелы
 */
export const cleanText = (text) => {
    if (text === null) return ""
    return text
        .replace(/[/\[\]()!?.,;:"'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Подготавливает полный текст песни для поиска (все варианты)
 */
const getSongText = (song) => {
    const title = cleanText(song.title || '')
    const variants = song.variants || [{ body: song.body || [] }]
    const bodies = variants.flatMap(v =>
        (v.body || []).map(b => cleanText(b.content || ''))
    )
    return [title, ...bodies].join(' ').toLowerCase()
}

/**
 * Подготавливает песню для индексации (обратная совместимость — объединяет все варианты)
 */
export const prepareSongForIndexing = (song) => {
    const bodyParts = song.variants
        ? song.variants.flatMap(variant => variant.body || [])
        : (song.body || []);

    const content = bodyParts
        .map(item => cleanText(item.content))
        .join(' ')

    return {
        n: song.number,
        title: cleanText(song.title),
        content
    }
}

/**
 * Подготавливает варианты песни для раздельной индексации
 * Каждый вариант становится отдельным документом с составным ref: "number:variantIndex"
 */
export const prepareVariantsForIndexing = (song) => {
    const variants = song.variants || [{ label: '', body: song.body || [] }];

    return variants.map((variant, index) => {
        const content = (variant.body || [])
            .map(item => cleanText(item.content))
            .join(' ')

        return {
            ref: `${song.number}:${index}`,
            n: song.number,
            title: cleanText(song.title),
            content,
            variantIndex: index
        }
    })
}

/**
 * Разбирает составной ref формата "number:variantIndex" на компоненты
 */
export const parseSearchRef = (ref) => {
    const colonIndex = ref.indexOf(':')
    if (colonIndex > 0) {
        return {
            n: ref.substring(0, colonIndex),
            variantIndex: parseInt(ref.substring(colonIndex + 1), 10) || 0
        }
    }
    return { n: ref, variantIndex: 0 }
}

/**
 * Строит Lunr-индекс из массива песен (каждый вариант — отдельный документ)
 */
export const buildSearchIndex = (songs) => {
    return lunr(function() {
        this.use(lunr.ru)
        this.ref('ref')
        this.field('title', { boost: 10 })
        this.field('content', { boost: 1 })
        this.pipeline.remove(lunr.stopWordFilter)

        songs.forEach(song => {
            const variants = prepareVariantsForIndexing(song)
            variants.forEach(variant => {
                this.add(variant)
            })
        })
    })
}

/**
 * Выполняет поиск по индексу Lunr (оригинальный алгоритм с fuzzy и морфологией)
 * - Одно слово → term~2 (fuzzy 2 правки)
 * - Несколько слов → +на все кроме последнего, ~2 на последнее
 * - Fallback на запрос без +, если +term даёт 0 результатов
 * - Дедупликация по номеру песни (оставляем лучший вариант)
 */
export const performSearch = (searchIndex, query, limit = 0) => {
    if (!searchIndex?.search || !query?.trim()) {
        return []
    }

    query = cleanText(query)
    if (query.length < 3) return []
    query = query.toLowerCase()

    try {
        const terms = query.trim().split(/\s+/)

        const primaryQuery = terms.length > 1
            ? terms.slice(0, -1).map(t => '+' + t).join(' ') + ' ' + terms[terms.length - 1] + '~2'
            : terms[0] + '~2'

        const fallbackQuery = terms.length > 1
            ? terms.slice(0, -1).join(' ') + ' ' + terms[terms.length - 1] + '~2'
            : terms[0] + '~2'

        let rawResults = searchIndex.search(primaryQuery)
        if (rawResults.length === 0) {
            rawResults = searchIndex.search(fallbackQuery)
        }

        let results = rawResults
            .map(({ ref, score }) => {
                const parsed = parseSearchRef(ref)
                return {
                    n: parsed.n,
                    variantIndex: parsed.variantIndex,
                    score,
                    title: ''
                }
            })
            .sort((a, b) => b.score - a.score)

        // Дедупликация по номеру песни — оставляем вариант с лучшим score
        const seen = new Map()
        results = results.filter(r => {
            if (seen.has(r.n)) return false
            seen.set(r.n, true)
            return true
        })

        return limit > 0 ? results.slice(0, limit) : results
    } catch (error) {
        console.error('Ошибка поиска:', error)
        return []
    }
}

// ============================================================================
// Точный поиск (новый алгоритм)
// - Одно слово → подстрока в тексте
// - Несколько слов → склеиваются в строку без пробелов, ищется как подстрока
// - Результаты сортируются по алфавиту
// ============================================================================

/**
 * Строит простой плоский индекс для точного поиска
 */
export const buildExactIndex = (songs) => {
    return songs.map(s => ({
        n: String(s.number),
        title: s.title || '',
        text: getSongText(s),
        textFlat: getSongText(s).replace(/\s+/g, '')
    }))
}

/**
 * Выполняет точный поиск: каждое слово запроса должно присутствовать в тексте
 * без пробелов между словами (как подстрока в склеенном тексте).
 */
export const performExactSearch = (searchIndex, query, limit = 0) => {
    if (!searchIndex || !query?.trim()) return []

    query = cleanText(query)
    if (query.length < 3) return []
    query = query.toLowerCase()

    const terms = query.trim().split(/\s+/)
    const isMultiWord = terms.length > 1

    const results = searchIndex.filter(s => {
        if (isMultiWord) {
            return s.textFlat.includes(terms.join(''))
        }
        return s.text.includes(query)
    })

    const gluedQuery = isMultiWord ? terms.join('') : null

    const scored = results.map(s => {
        let idx = -1
        if (isMultiWord) {
            idx = s.textFlat.indexOf(gluedQuery)
        } else {
            idx = s.text.indexOf(query)
        }
        const score = idx >= 0 ? 1 / (idx + 1) : 0.001
        return { n: s.n, variantIndex: 0, score, title: s.title }
    })

    scored.sort((a, b) => a.title.localeCompare(b.title, 'ru'))

    return limit > 0 ? scored.slice(0, limit) : scored
}
