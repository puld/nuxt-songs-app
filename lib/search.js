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
 * Строит простой индекс: [{n, title, text, variantCount}]
 */
export const buildSearchIndex = (songs) => {
    return songs.map(s => ({
        n: String(s.number),
        title: s.title || '',
        text: getSongText(s),
        textFlat: getSongText(s).replace(/\s+/g, '')
    }))
}

/**
 * Выполняет поиск по индексу.
 * Принцип:
 * - Одно слово → префикс слова (начинается с запроса), если ≥2 символов
 * - Несколько слов → склеиваются в одну строку без пробелов,
 *   ищется как подстрока в тексте песни (тоже без пробелов).
 *   Каждая новая буква сужает результат.
 * - exact=true → одиночный запрос как подстрока (не префикс)
 */
export const performSearch = (searchIndex, query, limit = 0, exact = false) => {
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
        // Одно слово: префикс или подстрока
        if (!exact && query.length >= 2) {
            return s.text.split(/\s+/).some(w => w.startsWith(query))
        }
        return s.text.includes(query)
    })

    const scored = results.map(s => {
        const idx = s.text.indexOf(query)
        const score = idx >= 0 ? 1 / (idx + 1) : 0.001
        return { n: s.n, variantIndex: 0, score, title: s.title }
    })

    scored.sort((a, b) => a.title.localeCompare(b.title, 'ru'))

    console.log('[search]', JSON.stringify({
        q: query,
        exact,
        glued: isMultiWord ? terms.join('') : null,
        total: scored.length,
        results: scored.slice(0, 20).map(r => ({
            n: r.n, score: r.score.toFixed(4), title: r.title
        }))
    }))

    return limit > 0 ? scored.slice(0, limit) : scored
}


