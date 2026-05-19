<template>
  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Библиотека</span>
    </Teleport>
  </ClientOnly>

  <div class="library-screen">
    <div v-if="!allSongs.length" class="empty-state">
      <p>Песни не загружены.</p>
      <NuxtLink to="/settings">Перейти в настройки для обновления базы</NuxtLink>
    </div>

    <template v-else>
      <div class="search-container">
        <input
          v-model="searchQuery"
          @input="handleSearch"
          placeholder="Поиск по названию"
          class="search-input"
        >
      </div>

      <div v-if="searchQuery.trim().length >= 3 && searchResults.length" class="search-results">
        <div
          v-for="result in searchResults"
          :key="result.n"
          class="search-result-row"
          @click="goToSong(result.n)"
        >
          <span class="song-number">{{ result.n }}.</span>
          <span class="song-title">{{ getSongTitle(result.n) }}</span>
          <FavoriteButton :song-number="result.n" />
        </div>
      </div>

      <template v-else>
        <div class="sort-toggle">
          <SettingToggle
            :options="sortOptions"
            :activeValue="sortMode"
            @update:value="sortMode = $event"
          />
        </div>

        <div class="songs-list">
          <div
            v-for="song in sortedSongs"
            :key="song.number"
            class="song-row"
            @click="goToSong(song.number)"
          >
            <span class="song-number">{{ song.number }}.</span>
            <span class="song-title">{{ song.title }}</span>
            <FavoriteButton :song-number="song.number" />
          </div>
        </div>

        <div v-if="sortMode === 'favorites' && !sortedSongs.length" class="empty-favorites">
          Нет избранных песен
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
const { getAllSongs } = useIndexDB()
const { searchResults, searchQuery, buildIndex, search } = useSongSearch()
const favoritesStore = useFavoritesStore()
const { favoriteSongs } = storeToRefs(favoritesStore)

const allSongs = ref([])
const sortMode = ref('numeric')

const sortOptions = [
  { value: 'alphabetical', label: 'По алфавиту' },
  { value: 'numeric', label: 'По номерам' },
  { value: 'favorites', label: 'Избранное' }
]

const sortedSongs = computed(() => {
  let songs = [...allSongs.value]

  if (sortMode.value === 'favorites') {
    songs = songs.filter(s => favoriteSongs.value.includes(s.number))
  }

  if (sortMode.value === 'alphabetical') {
    return songs.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }
  return songs.sort((a, b) => a.number - b.number)
})

onMounted(async () => {
  allSongs.value = await getAllSongs()
  buildIndex(allSongs.value)
})

const handleSearch = () => {
  search(searchQuery.value, 0)
}

const getSongTitle = (n) => {
  const song = allSongs.value.find(s => Number(s.number) === Number(n))
  return song ? song.title : 'Неизвестная песня'
}

const goToSong = (number) => {
  navigateTo(`/song/${number}`)
}
</script>

<style scoped>
.library-screen {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.search-container {
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}

.search-results {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 1.5rem;
}

.search-result-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.search-result-row:last-child {
  border-bottom: none;
}

.search-result-row:hover {
  background: var(--bg-secondary);
}

.sort-toggle {
  margin-bottom: 1.5rem;
}

.songs-list {
  display: flex;
  flex-direction: column;
}

.song-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.song-row:hover {
  background: var(--bg-secondary);
}

.song-row .song-number {
  font-weight: bold;
  color: var(--primary);
  margin-right: 0.5rem;
  flex-shrink: 0;
}

.song-row .song-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.empty-state a {
  color: var(--primary);
}

.empty-favorites {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

@media (max-width: 480px) {
  .library-screen {
    padding: 1rem;
  }
}
</style>
