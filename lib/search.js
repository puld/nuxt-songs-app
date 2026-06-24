import lunr from 'lunr'
import lunrStemmerSupport from 'lunr-languages/lunr.stemmer.support'
import lunrRu from 'lunr-languages/lunr.ru'

// Подключаем stemmer перед языковыми плагинами
lunrStemmerSupport(lunr)

// Регистрируем русский язык в Lunr
lunrRu(lunr)

// Константы поиска
const MIN_QUERY_LENGTH = 3
const LUNR_TITLE_BOOST = 10
const LUNR_CONTENT_BOOST = 1
const LUNR_FUZZY_DISTANCE = 2
const EXACT_TITLE_SCORE_BASE = 2  // title-матчи: base + 1/(pos+1) → диапазон (2, 3]
                                   // body-матчи: 0 + 1/(pos+1) → диапазон (0, 1]
                                   // Разрыв гарантирует: точный title > точный body > Lunr

export const MATCH_TYPE = {
    EXACT: 'exact',
    LUNR: 'lunr'
}

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
        this.field('title', { boost: LUNR_TITLE_BOOST })
        this.field('content', { boost: LUNR_CONTENT_BOOST })
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
    if (query.length < MIN_QUERY_LENGTH) return []
    query = query.toLowerCase()
    try {
        // Строим поисковый запрос:
        // + на все слова кроме последнего (обязательное вхождение),
        // ~2 на последнее слово (fuzzy — может быть недописано).
        // Если +запрос даёт 0 результатов — fallback на запрос без +.
        const terms = query.trim().split(/\s+/)

        const primaryQuery = terms.length > 1
            ? terms.slice(0, -1).map(t => '+' + t).join(' ') + ' ' + terms[terms.length - 1] + '~' + LUNR_FUZZY_DISTANCE
            : terms[0] + '~' + LUNR_FUZZY_DISTANCE

        const fallbackQuery = terms.length > 1
            ? terms.slice(0, -1).join(' ') + ' ' + terms[terms.length - 1] + '~' + LUNR_FUZZY_DISTANCE
            : terms[0] + '~' + LUNR_FUZZY_DISTANCE

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
                    title: '',
                    matchType: MATCH_TYPE.LUNR
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

/**
 * Строит индекс для точного посимвольного поиска
 * Каждый вариант песни — отдельная запись
 * @param {Array} songs - Массив песен
 * @returns {Array<{n: string, title: string, variantIndex: number, titleFlat: string, textFlat: string}>}
 */
export const buildExactIndex = (songs) => {
    return songs.flatMap(song => {
        const variants = song.variants || [{ label: '', body: song.body || [] }]
        const titleClean = cleanText(song.title || '').toLowerCase()
        const titleFlat = titleClean.replace(/\s+/g, '')

        return variants.map((variant, index) => {
            const contentClean = (variant.body || [])
                .map(item => cleanText(item.content || ''))
                .join(' ')
                .toLowerCase()
            const fullText = [titleClean, contentClean].join(' ')
            const textFlat = fullText.replace(/\s+/g, '')

            return {
                n: String(song.number),
                title: song.title || '',
                variantIndex: index,
                titleFlat,
                textFlat
            }
        })
    })
}

/**
 * Выполняет точный посимвольный поиск
 * Пробелы в запросе удаляются, ищется как подстрока в склеенном тексте
 * Title-совпадения получают score > EXACT_TITLE_SCORE_BASE, body-совпадения — score <= 1
 * @param {Array} exactIndex - Индекс из buildExactIndex
 * @param {string} query - Поисковый запрос
 * @param {number} limit - Лимит результатов (0 = без лимита)
 * @returns {Array<{n: string, variantIndex: number, score: number, title: string, matchType: string}>}
 */
export const performExactSearch = (exactIndex, query, limit = 0) => {
    if (!exactIndex || !query?.trim()) return []

    query = cleanText(query)
    if (query.length < MIN_QUERY_LENGTH) return []
    query = query.toLowerCase()

    const normalizedQuery = query.split(/\s+/).join('')

    const results = []

    for (const entry of exactIndex) {
        // Проверяем совпадение в заголовке
        const titleIdx = entry.titleFlat.indexOf(normalizedQuery)
        if (titleIdx >= 0) {
            results.push({
                n: entry.n,
                variantIndex: entry.variantIndex,
                score: EXACT_TITLE_SCORE_BASE + 1 / (titleIdx + 1),
                title: entry.title,
                matchType: MATCH_TYPE.EXACT
            })
            continue  // title-матч уже лучший, пропускаем body
        }

        // Проверяем совпадение в полном тексте
        const textIdx = entry.textFlat.indexOf(normalizedQuery)
        if (textIdx >= 0) {
            results.push({
                n: entry.n,
                variantIndex: entry.variantIndex,
                score: 1 / (textIdx + 1),
                title: entry.title,
                matchType: MATCH_TYPE.EXACT
            })
        }
    }

    // Сортировка: по score по убыванию, при равном score — по алфавиту
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))

    // Дедупликация по n — оставляем лучший вариант
    const seen = new Set()
    const deduped = results.filter(r => {
        if (seen.has(r.n)) return false
        seen.add(r.n)
        return true
    })

    return limit > 0 ? deduped.slice(0, limit) : deduped
}

/**
 * Выполняет объединённый поиск: точный + Lunr (нечёткий)
 * Приоритет: точный title → точный body → Lunr
 * Дедупликация: песня, найденная точным поиском, не повторяется в Lunr-результатах
 * @param {Array} exactIndex - Индекс из buildExactIndex
 * @param {Object} lunrIndex - Индекс из buildSearchIndex
 * @param {string} query - Поисковый запрос
 * @param {number} limit - Лимит результатов (0 = без лимита)
 * @returns {Array<{n: string, variantIndex: number, score: number, title: string, matchType: string}>}
 */
export const performUnifiedSearch = (exactIndex, lunrIndex, query, limit = 0) => {
    if (!query?.trim()) return []

    query = cleanText(query)
    if (query.length < MIN_QUERY_LENGTH) return []

    // 1. Точный поиск
    const exactResults = exactIndex
        ? performExactSearch(exactIndex, query, 0)
        : []

    // 2. Lunr-поиск
    const lunrResults = lunrIndex
        ? performSearch(lunrIndex, query, 0)
        : []

    // 3. Собираем номера из точного поиска для дедупликации
    const exactNumbers = new Set(exactResults.map(r => r.n))

    // 4. Фильтруем Lunr-результаты: убираем дубли из точного поиска
    const filteredLunr = lunrResults.filter(r => !exactNumbers.has(r.n))

    // 5. Объединяем: точные выше Lunr
    const combined = [...exactResults, ...filteredLunr]

    // 6. Применяем лимит
    return limit > 0 ? combined.slice(0, limit) : combined
}
