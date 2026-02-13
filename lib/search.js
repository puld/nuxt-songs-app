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
    return text
        .replace(/[/\[\]()!?.,;:"'-]/g, ' ') // Удаляем спецсимволы, включая квадратные скобки
        .replace(/\s+/g, ' ') // Схлопываем множественные пробелы
        .trim()
}

/**
 * Подготавливает песню для индексации
 * @param {Object} song - Объект песни
 * @returns {Object} Объект с полями для индексации
 */
export const prepareSongForIndexing = (song) => {
    const content = song.body
        .map(item => cleanText(item.content))
        .join(' ')

    return {
        n: song.number,
        title: cleanText(song.title),
        content
    }
}

/**
 * Строит поисковый индекс из массива песен
 * @param {Array} songs - Массив песен
 * @returns {Object} Индекс Lunr
 */
export const buildSearchIndex = (songs) => {
    return lunr(function() {
        // Используем русский язык для морфологического анализа
        this.use(lunr.ru)

        // Настройка поисковых полей с весами для приоритизации
        this.ref('n')
        this.field('title', { boost: 3 }) // Заголовок имеет больший вес при поиске
        this.field('content', { boost: 1 }) // Содержимое имеет стандартный вес

        // Отключаем фильтр стоп-слов для поддержки всех слов
        this.pipeline.remove(lunr.stopWordFilter)

        // Индексация каждой песни
        songs.forEach(song => {
            const prepared = prepareSongForIndexing(song)
            this.add(prepared)
        })
    })
}

/**
 * Выполняет поиск по индексу
 * @param {Object} searchIndex - Индекс Lunr
 * @param {string} query - Поисковый запрос
 * @returns {Array} Массив результатов поиска
 */
export const performSearch = (searchIndex, query) => {
    // Проверяем наличие индекса поиска и валидность запроса
    if (!searchIndex?.search || !query?.trim()) {
        return []
    }

    try {
        // Выполняем нечеткий поиск с расстоянием Левенштейна = 1 (~1)
        return searchIndex
            .search(`${query.trim()}~1`)
            .map(({ ref, score }) => ({
                n: ref, // Номер песни
                score, // Релевантность результата
                title: '' // Заголовок будет заполнен позже
            }))
            .sort((a, b) => b.score - a.score) // Сортируем по убыванию релевантности
    } catch (error) {
        console.error('Ошибка поиска:', error)
        return [] // Возвращаем пустой массив при ошибке
    }
}
