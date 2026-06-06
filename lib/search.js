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
        variantCount: (s.variants || []).length
    }))
}

/**
 * Выполняет поиск по индексу.
 * Принцип:
 * - Все термины кроме последнего — подстрока в любом месте текста
 * - Последний термин — префикс какого-либо слова (если ≥2 символов),
 *   иначе подстрока
 * - При exact=true все термины обязательны как подстроки
 * - Результаты сортируются по алфавиту
 */
export const performSearch = (searchIndex, query, limit = 0, exact = false, _songs = null) => {
    if (!searchIndex || !query?.trim()) return []

    query = cleanText(query)
    if (query.length < 3) return []
    query = query.toLowerCase()

    const terms = query.trim().split(/\s+/)
    const lastTerm = terms[terms.length - 1]

    // Для префикс-поиска последнего слова
    const prefixSearch = lastTerm.length >= 2 && !exact

    let results = searchIndex

    if (terms.length > 1) {
        const mandatory = terms.slice(0, -1)
        // Фильтруем: все слова кроме последнего — подстрока
        results = results.filter(s => mandatory.every(t => s.text.includes(t)))
    }

    // Последний термин
    if (prefixSearch) {
        // Префиксный поиск: ищем слово, начинающееся с lastTerm
        results = results.filter(s => {
            const words = s.text.split(/\s+/)
            return words.some(w => w.startsWith(lastTerm))
        })
    } else {
        // Точный или обычный: подстрока
        results = results.filter(s => s.text.includes(lastTerm))
    }

    // Считаем score: длина совпадения / длина текста (чем ближе к началу, тем выше)
    const scored = results.map(s => {
        const idx = s.text.indexOf(lastTerm)
        const score = idx >= 0 ? 1 / (idx + 1) : 0.001
        return { n: s.n, variantIndex: 0, score, title: s.title }
    })

    // Сортируем по алфавиту
    scored.sort((a, b) => a.title.localeCompare(b.title, 'ru'))

    // Лог
    console.log('[search]', JSON.stringify({
        q: query,
        exact,
        terms,
        prefixSearch,
        total: scored.length,
        results: scored.slice(0, 20).map(r => ({
            n: r.n, score: r.score.toFixed(4), title: r.title
        }))
    }))

    return limit > 0 ? scored.slice(0, limit) : scored
}
