import { ref } from 'vue'
import { buildSearchIndex, buildExactIndex, performUnifiedSearch } from '~/lib/search'

export const useSongSearch = () => {
    const searchIndex = ref(null)
    const exactIndex = ref(null)
    const searchResults = ref([])
    const searchQuery = ref('')

    const buildIndex = (songs) => {
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
