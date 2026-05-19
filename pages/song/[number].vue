<template>
  <ClientOnly>
    <Teleport to="#navbar-center" v-if="song">
      <span class="nav-title">{{ song.number }}. {{ song.title }}</span>
    </Teleport>
  </ClientOnly>

  <div v-if="loading">Загрузка...</div>
  <div v-else-if="song">
    <div class="song-nav-wrapper">
      <div class="song-nav">
        <NuxtLink
            v-if="hasPrev"
            @click="goToSong(prevSongNumber)"
            class="nav-link prev"
        >
          <Icon name="mingcute:left-line" />
          {{ prevSongNumber }}
        </NuxtLink>
        <span v-else class="nav-link-placeholder"></span>

        <button class="nav-link search-btn" @click="showSearchModal = true">
          <Icon name="mingcute:search-line" />
          Поиск
        </button>

        <NuxtLink
            v-if="hasNext"
            @click="goToSong(nextSongNumber)"
            class="nav-link next"
        >
          {{ nextSongNumber }}
          <Icon name="mingcute:right-line" />
        </NuxtLink>
        <span v-else class="nav-link-placeholder"></span>
      </div>
    </div>

    <SongDisplay :song="song"/>

    <div class="song-nav-wrapper">
      <div class="song-nav">
        <NuxtLink
            v-if="hasPrev"
            @click="goToSong(prevSongNumber)"
            class="nav-link prev"
        >
          <Icon name="mingcute:left-line" />
          {{ prevSongNumber }}
        </NuxtLink>
        <span v-else class="nav-link-placeholder"></span>

        <button class="nav-link search-btn" @click="showSearchModal = true">
          <Icon name="mingcute:search-line" />
          Поиск
        </button>

        <NuxtLink
            v-if="hasNext"
            @click="goToSong(nextSongNumber)"
            class="nav-link next"
        >
          {{ nextSongNumber }}
          <Icon name="mingcute:right-line" />
        </NuxtLink>
        <span v-else class="nav-link-placeholder"></span>
      </div>
    </div>

    <div class="collections-section">
      <div v-if="songCollections.length > 0" class="current-collections">
        <h3>Входит в подборки:</h3>
        <ul>
          <li v-for="col in songCollections" :key="col.id" class="nav">
            <NuxtLink :to="`/collections/${col.id}`">{{ col.name }}</NuxtLink>
            <NuxtLink @click="removeFromCollection(col.id)" class="remove-btn">Х</NuxtLink>
          </li>
        </ul>
      </div>
      <h3>Добавить в подборку</h3>
      <nav class="nav">
        <select v-model="selectedCollection">
          <option value="">Новая подборка</option>
          <option
              v-for="collection in collections"
              :key="collection.id"
              :value="collection.id"
          >
            {{ collection.name }}
          </option>
        </select>

        <input
            v-if="selectedCollection === ''"
            v-model="newCollectionName"
            placeholder="Название подборки"
        >

        <NuxtLink @click="addToCollection">
          <Icon name="mingcute:add-line" />
        </NuxtLink>
      </nav>
    </div>

    <div v-if="showSearchModal" class="modal" @click.self="showSearchModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Поиск песен</h3>
          <button class="modal-close" @click="showSearchModal = false">
            <Icon name="mingcute:close-line" />
          </button>
        </div>

        <div class="modal-search-container">
          <input
              v-model="searchQuery"
              @input="handleSearch"
              placeholder="Поиск по тексту"
              class="search-input"
          >

          <div v-if="searchResults.length" class="search-results">
            <div
                v-for="result in searchResults"
                :key="result.n"
                class="result-item"
                @click="navigateFromModal(result.n)"
            >
              <span class="song-number">{{ result.n }}.</span>
              <span class="song-title">{{ getSongTitle(result.n) }}</span>
              <span class="score">(совпадение: {{ (result.score * 100).toFixed(1) }}%)</span>
            </div>
          </div>
        </div>

        <div class="modal-number-selector">
          <form @submit.prevent="goFromModal">
            <input
                v-model.number="modalSongNumber"
                type="number"
                :min="1"
                :max="maxSongNumber"
                :placeholder="`Поиск по номеру (1-${maxSongNumber})`"
                required
                inputmode="numeric"
                class="number-input"
            >
            <button type="submit" class="go-btn">Перейти</button>
          </form>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Песня не найдена</p>
    <NuxtLink to="/">Вернуться на главную</NuxtLink>
  </div>
</template>

<script setup>
const route = useRoute();
const router = useRouter()
const {
  getSong,
  getSongNumbers,
  createCollection,
  getCollectionsForSong,
  addSongToCollection,
  getAvailableCollections,
  removeSongFromCollection,
  getAllSongs
} = useIndexDB();
const { searchIndex, searchResults, searchQuery, buildIndex, search } = useSongSearch()

const song = ref(null);
const loading = ref(true);
const collections = ref([]);
const songCollections = ref([]);
const selectedCollection = ref('');
const newCollectionName = ref('');
const songNumbers = ref([]);
const currentIndex = ref(-1);

const showSearchModal = ref(false)
const modalSongNumber = ref(null)
const maxSongNumber = ref(0)
const allSongs = ref([])

onMounted(async () => {
  const songNumber = parseInt(route.params.number);

  songNumbers.value = await getSongNumbers()
  song.value = await getSong(songNumber);
  currentIndex.value = songNumbers.value.indexOf(songNumber)
  maxSongNumber.value = Math.max(...songNumbers.value)

  if (!song.value) {
    loading.value = false;
    return;
  }

  allSongs.value = await getAllSongs()
  buildIndex(allSongs.value)

  songCollections.value = await getCollectionsForSong(songNumber);
  collections.value = await getAvailableCollections(songNumber);

  loading.value = false;
});

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < songNumbers.value.length - 1)
const prevSongNumber = computed(() => hasPrev.value ? songNumbers.value[currentIndex.value - 1] : null)
const nextSongNumber = computed(() => hasNext.value ? songNumbers.value[currentIndex.value + 1] : null)

const goToSong = (number) => {
  router.push(`/song/${number}`)
}

const getSongTitle = (n) => {
  const s = allSongs.value.find(s => Number(s.number) === Number(n))
  return s ? s.title : 'Неизвестная песня'
}

const handleSearch = () => {
  search(searchQuery.value, 7)
}

const goFromModal = () => {
  if (modalSongNumber.value >= 1 && modalSongNumber.value <= maxSongNumber.value) {
    router.push(`/song/${modalSongNumber.value}`)
    showSearchModal.value = false
    modalSongNumber.value = null
  }
}

const navigateFromModal = (n) => {
  router.push(`/song/${n}`)
  showSearchModal.value = false
  searchQuery.value = ''
  searchResults.value = []
}

const addToCollection = async () => {
  if (selectedCollection.value === '') {
    if (!newCollectionName.value.trim()) return;
    selectedCollection.value = await createCollection(newCollectionName.value);
  }

  await addSongToCollection(selectedCollection.value, song.value.number);
  songCollections.value = await getCollectionsForSong(song.value.number);
  selectedCollection.value = '';
  newCollectionName.value = '';
};

const removeFromCollection = async (collectionId) => {
  if (!confirm('Удалить песню из этой подборки?')) return

  try {
    await removeSongFromCollection(
        Number(collectionId),
        Number(route.params.number)
    )
    songCollections.value = songCollections.value.filter(
        c => c.id !== collectionId
    )
    collections.value = await getAvailableCollections(route.params.number)
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить песню')
  }
}
</script>

<style scoped>
.song-nav-wrapper {
  margin: 1rem auto;
}

/* Ширина как у .song-content-wrapper в SongDisplay */
@media (min-width: 640px) {
  .song-nav-wrapper { width: 83.33%; }
}
@media (min-width: 768px) {
  .song-nav-wrapper { width: 66.67%; }
}
@media (min-width: 1024px) {
  .song-nav-wrapper { width: 50%; }
}

.song-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text);
  text-decoration: none;
  transition: all 0.2s;
  background: var(--bg);
  cursor: pointer;
  font-size: 1rem;
  white-space: nowrap;
}

.nav-link:hover {
  background: var(--bg-secondary);
}

.nav-link-placeholder {
  width: 70px;
  flex-shrink: 1;
}

.search-btn {
  font-family: inherit;
}

.collections-section {
  margin-top: 2rem;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.current-collections ul {
  list-style: none;
  padding: 0;
}

.current-collections li {
  margin: 0.5rem 0;
}

.remove-btn {
  padding: 0.25rem 0.5rem;
  margin-left: 1rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* Модальное окно поиска */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding-top: 10vh;
}

.modal-content {
  background: var(--bg);
  border-radius: 8px;
  max-width: 500px;
  width: calc(100% - 2rem);
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1rem 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
}

.modal-close:hover {
  color: var(--text);
}

.modal-search-container {
  padding: 1rem;
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
  max-height: 250px;
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
  margin-right: 0.5rem;
  color: var(--primary);
  flex-shrink: 0;
}

.song-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.score {
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.modal-number-selector {
  padding: 0 1rem 1rem;
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.modal-number-selector form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}

.number-input {
  flex: 1;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
  -moz-appearance: textfield;
}

.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.go-btn {
  padding: 0.8rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  height: 100%;
  box-sizing: border-box;
  min-width: 80px;
}

@media (max-width: 480px) {
  .number-input {
    font-size: 16px;
  }
}
</style>