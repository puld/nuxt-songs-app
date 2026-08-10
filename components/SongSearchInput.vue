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
          <span class="song-title">{{ titleOf(result.n) }}</span>
          <span v-if="variantLabelOf(result.n, result.variantIndex)" class="variant-label">({{ variantLabelOf(result.n, result.variantIndex) }})</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { buildSongsMap, getSongTitle, getVariantLabel } from '~/lib/songsIndex'

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
    default: null
  },
  maxWidth: {
    type: String,
    default: '100%'
  }
})

const emit = defineEmits(['select'])

const { searchResults, searchQuery, buildIndex, search: unifiedSearch } = useSongSearch()

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
    unifiedSearch(query, props.limit)
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
    unifiedSearch(query, props.limit)
  }
}

const handleResultClick = (result) => {
  emit('select', { n: result.n, variantIndex: result.variantIndex })
  clear()
}

// Карта «номер → песня» строится один раз на инстанс: без неё каждый
// результат выдачи искал песню линейным find по 1565 записям.
const songsMap = computed(() => buildSongsMap(props.songs))

const titleOf = (n) => getSongTitle(songsMap.value, n)

const variantLabelOf = (n, variantIndex) => getVariantLabel(songsMap.value, n, variantIndex)

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
  min-width: 150px;
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
  /* Динамическая высота: доступное место от поля поиска до низа экрана.
     Смещение ~210px ≈ navbar(56) + page-content padding-top(16) +
     welcome-screen padding(32) + search-container margin(32) +
     высота формы(~48) + margin результатов(8) + нижний отступ(16).
     svh, а не vh/dvh — та же причина, что у .layout в layouts/default.vue:
     это высота вьюпорта при показанном системном UI, поэтому выдача не
     вылезает за экран, когда на Android появляется системная навигация.
     Если контент меньше max-height — скролла нет; если больше — появляется. */
  max-height: calc(100svh - 210px);
}

.result-item {
  padding: 0.85rem 0.8rem;
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
