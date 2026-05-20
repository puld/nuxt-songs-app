<template>
  <div class="song-search" :style="{ maxWidth: maxWidth }">
    <form @submit.prevent="handleSubmit" class="search-form">
      <input
        ref="searchInput"
        v-model="searchQuery"
        @input="handleInput"
        placeholder="Номер или текст"
        class="search-input"
      >
      <button type="submit" class="search-btn">
        <Icon name="mingcute:search-line" size="1.2rem"/>
      </button>
    </form>

    <Transition name="results">
      <div v-if="searchResults.length" class="search-results" :style="{ maxHeight: maxResultsHeight }">
        <div
          v-for="result in searchResults"
          :key="result.n + '-' + result.variantIndex"
          class="result-item"
          @click="handleResultClick(result)"
        >
          <span class="song-number">{{ result.n }}</span>
          <span class="song-title">{{ getSongTitle(result.n) }}</span>
          <span v-if="getVariantLabel(result.n, result.variantIndex)" class="variant-label">({{ getVariantLabel(result.n, result.variantIndex) }})</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  songs: {
    type: Array,
    required: true
  },
  songNumbers: {
    type: Array,
    required: true
  },
  limit: {
    type: Number,
    default: 7
  },
  maxResultsHeight: {
    type: String,
    default: '200px'
  },
  maxWidth: {
    type: String,
    default: '100%'
  }
})

const emit = defineEmits(['select'])

const { searchResults, searchQuery, buildIndex, search: lunrSearch } = useSongSearch()

const searchInput = ref(null)

onMounted(() => {
  buildIndex(props.songs)
})

const isNumberQuery = (query) => {
  return /^\d+$/.test(query.trim())
}

const handleInput = () => {
  const query = searchQuery.value?.trim()
  if (query && isNumberQuery(query)) {
    searchResults.value = []
  } else {
    lunrSearch(query, props.limit)
  }
}

const handleSubmit = () => {
  const query = searchQuery.value?.trim()
  if (!query) return

  if (isNumberQuery(query)) {
    const num = parseInt(query)
    if (num && props.songNumbers.includes(num)) {
      emit('select', { n: num, variantIndex: 0 })
      clear()
    }
  } else {
    lunrSearch(query, props.limit)
  }
}

const handleResultClick = (result) => {
  emit('select', { n: result.n, variantIndex: result.variantIndex })
  clear()
}

const getSongTitle = (n) => {
  const song = props.songs.find(s => Number(s.number) === Number(n))
  return song ? song.title : 'Неизвестная песня'
}

const getVariantLabel = (n, variantIndex) => {
  const song = props.songs.find(s => Number(s.number) === Number(n))
  if (!song?.variants || song.variants.length <= 1) return ''
  return song.variants[variantIndex]?.label || ''
}

const focus = () => {
  searchInput.value?.focus()
}

const clear = () => {
  searchQuery.value = ''
  searchResults.value = []
}

defineExpose({ focus, clear })
</script>

<style scoped>
.search-form {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}

.search-btn {
  padding: 0.8rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
}

.search-btn:hover {
  opacity: 0.9;
}

.search-results {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow-y: auto;
  margin-top: 0.5rem;
  box-sizing: border-box;
}

.result-item {
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.result-item:last-child {
  border-bottom: none;
}

.result-item:hover {
  background-color: var(--bg-secondary);
}

.song-number {
  font-weight: bold;
  min-width: 2.5rem;
  text-align: right;
  margin-right: 0.5rem;
  color: var(--primary);
}

.song-title {
  flex-grow: 1;
  font-size: 0.9rem;
}

.variant-label {
  font-size: 0.75rem;
  color: var(--primary);
}

/* Results transition */
.results-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.results-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.results-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.results-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
