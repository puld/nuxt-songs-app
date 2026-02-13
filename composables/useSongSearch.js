import { ref } from 'vue'
import { buildSearchIndex, performSearch } from '~/lib/search'

export const useSongSearch = () => {
    const searchIndex = ref(null)
    const searchResults = ref([])
    const searchQuery = ref('')

    const buildIndex = (songs) => {
        searchIndex.value = buildSearchIndex(songs)
    }

    const search = (query) => {
        searchResults.value = performSearch(searchIndex.value, query)
    }

    return {
        searchIndex,
        searchResults,
        searchQuery,
        buildIndex,
        search
    }
}