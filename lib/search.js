import lunr from 'lunr'
import lunrStemmerSupport from 'lunr-languages/lunr.stemmer.support'
import lunrRu from 'lunr-languages/lunr.ru'

// Подключаем stemmer перед языковыми плагинами
lunrStemmerSupport(lunr)

// Регистрируем русский язык в Lunr
lunrRu(lunr)

/**
 * Очищает текст от спецсимволов и нормализует пробелы
 * @param {string} text - Исходный текст
 * @returns {string} Очищенный текст
 */
export const cleanText = (text) => {
    if (text === null) return ""
    return text
        .replace(/[/\[\]()!?.,;:"'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Подготавливает песню для индексации (обратная совместимость — объединяет все варианты)
 * @param {Object} song - Объект песни
 * @returns {Object} Объект с полями для индексации
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
 * variantIndex — числовой id варианта (0, 1, 2, ...)
 * @param {Object} song - Объект песни
 * @returns {Array<Object>} Массив объектов для индексации (по одному на вариант)
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
 * Строит поисковый индекс из массива песен (каждый вариант — отдельный документ)
 * @param {Array} songs - Массив песен
 * @returns {Object} Индекс Lunr
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
 * Разбирает составной ref формата "number:variantIndex" на компоненты
 * @param {string} ref - Составной ref из поискового индекса
 * @returns {{ n: string, variantIndex: number }}
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
 * Выполняет поиск по индексу
 * Результаты дедуплицируются по номеру песни — оставляется вариант с наивысшим score
 * @param {Object} searchIndex - Индекс Lunr
 * @param {string} query - Поисковый запрос
 * @param {number} limit - лимит результатов
 * @returns {Array} Массив результатов поиска с полями n, variantIndex, score, title
 */
export const performSearch = (searchIndex, query, limit = 0) => {
    if (!searchIndex?.search || !query?.trim()) {
        return []
    }

    query = cleanText(query)
    if (query.length < 3) return []
    query = query.toLowerCase()
    try {
        // Строим поисковый запрос:
        // + на все слова кроме последнего (обязательное вхождение),
        // ~2 на последнее слово (fuzzy — может быть недописано).
        // Если +запрос даёт 0 результатов — fallback на запрос без +.
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
