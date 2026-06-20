import { ref } from 'vue'
import { buildSearchIndex, performSearch, buildExactIndex, performExactSearch } from '~/lib/search'

export const useSongSearch = () => {
    const searchIndex = ref(null)
    const exactIndex = ref(null)
    const searchResults = ref([])
    const exactResults = ref([])
    const searchQuery = ref('')
    const exactQuery = ref('')

    const buildIndex = (songs) => {
        searchIndex.value = buildSearchIndex(songs)
        exactIndex.value = buildExactIndex(songs)
    }

    const search = (query, limit) => {
        searchResults.value = performSearch(searchIndex.value, query, limit)
    }

    const searchExact = (query, limit) => {
        exactResults.value = performExactSearch(exactIndex.value, query, limit)
    }

    return {
        searchIndex,
        exactIndex,
        searchResults,
        exactResults,
        searchQuery,
        exactQuery,
        buildIndex,
        search,
        searchExact
    }
}
