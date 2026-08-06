import { ref } from 'vue'
import { buildSearchIndex, buildExactIndex, performUnifiedSearch } from '~/lib/search'

// Индексы — синглтон на уровне модуля: 1565 песен индексируются один раз
// за сессию. Иначе попап поиска на странице песни, который монтируется
// заново при каждом открытии, каждый раз строит индексы с нуля — отсюда лаг.
//
// Синглтоном становятся ТОЛЬКО индексы. searchQuery/searchResults остаются
// локальными для каждого инстанса: поле на главной и попап на странице песни
// не должны делить ввод и выдачу.
const searchIndex = ref(null)
const exactIndex = ref(null)

/**
 * Сбрасывает индексы, чтобы они построились заново.
 * Вызывается после обновления базы песен (`useSongs.fetchSongs`).
 */
export const resetSearchIndex = () => {
    searchIndex.value = null
    exactIndex.value = null
}

export const useSongSearch = () => {
    const searchResults = ref([])
    const searchQuery = ref('')

    /**
     * Строит индексы по песням. Повторный вызов — no-op: индексы общие
     * и уже готовы. `force: true` — принудительная перестройка.
     */
    const buildIndex = (songs, { force = false } = {}) => {
        if (searchIndex.value && !force) return

        searchIndex.value = buildSearchIndex(songs)
        exactIndex.value = buildExactIndex(songs)
    }

    const search = (query, limit) => {
        searchResults.value = performUnifiedSearch(
            exactIndex.value,
            searchIndex.value,
            query,
            limit
        )
    }

    return {
        searchIndex,
        exactIndex,
        searchResults,
        searchQuery,
        buildIndex,
        search
    }
}
