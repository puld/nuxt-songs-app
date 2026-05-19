<template>
  <ClientOnly>
    <!-- Навбар: стрелки + номер песни -->
    <Teleport to="#navbar-center" v-if="song">
      <button v-if="hasPrev" class="nav-arrow" @click="goToSong(prevSongNumber)" aria-label="Предыдущая песня">
        <Icon name="mingcute:left-line" size="1.25rem"/>
      </button>
      <button class="nav-title nav-title-btn" @click="showGoToPopover = true" aria-label="Перейти к песне">
        № {{ song.number }}
      </button>
      <button v-if="hasNext" class="nav-arrow" @click="goToSong(nextSongNumber)" aria-label="Следующая песня">
        <Icon name="mingcute:right-line" size="1.25rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <!-- Popover для перехода по номеру -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showGoToPopover" class="goto-overlay" @click.self="closeGoToPopover">
        <div class="goto-popover">
          <form @submit.prevent="goToSongFromPopover">
            <input
              ref="gotoInput"
              v-model="gotoNumber"
              type="number"
              inputmode="numeric"
              :placeholder="`Номер песни (1-${maxSongNumber})`"
              class="goto-input"
              autofocus
            >
            <button type="submit" class="goto-btn">Перейти</button>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Popover для поиска по тексту -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showSearchPopover" class="search-overlay" @click.self="closeSearchPopover">
        <div class="search-popover">
          <input
            ref="searchInput"
            v-model="searchQuery"
            @input="handleSearch"
            placeholder="Поиск по тексту"
            class="search-popover-input"
            autofocus
          >
          <div v-if="searchResults.length" class="search-popover-results">
            <div
              v-for="result in searchResults"
              :key="result.n"
              class="search-popover-row"
              @click="goToSongFromSearch(result.n)"
            >
              <span class="song-number">{{ result.n }}.</span>
              <span class="song-title">{{ getSearchSongTitle(result.n) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <div v-if="loading">Загрузка...</div>
  <div v-else-if="song">
    <!-- Название песни в теле страницы -->
    <div class="song-header">
      <h1 class="song-title" @click="showSearchPopover = true">{{ song.title }}</h1>
      <FavoriteButton :song-number="song.number" />
    </div>

    <SongDisplay
      :song="song"
      :initialVariantIndex="currentVariantIndex"
      @variant-change="onVariantChange"
    />

    <div class="collections-section">
      <div v-if="songCollections.length > 0" class="current-collections">
        <h3>Входит в подборки:</h3>
        <ul>
          <li v-for="col in songCollections" :key="col.id + '-' + col.variantIndex" class="collection-item">
            <NuxtLink :to="collectionLink(col)" class="collection-link">
              {{ col.name }}
              <span v-if="getVariantLabel(col.variantIndex)" class="variant-badge">{{ getVariantLabel(col.variantIndex) }}</span>
            </NuxtLink>
            <button @click="removeFromCollection(col)" class="remove-btn">✕</button>
          </li>
        </ul>
      </div>

      <h3>
        Добавить в подборку
        <span v-if="currentVariantLabel" class="variant-hint"> ({{ currentVariantLabel }})</span>
      </h3>

      <div class="add-to-collection">
        <select v-model="selectedCollection" class="collection-select">
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
            class="collection-input"
        >

        <button @click="addToCollection" class="add-btn">
          <Icon name="mingcute:add-line" size="1.25rem"/>
          <span>Добавить</span>
        </button>
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
const { searchResults, searchQuery, buildIndex, search } = useSongSearch()

const song = ref(null);
const loading = ref(true);
const collections = ref([]);
const songCollections = ref([]);
const selectedCollection = ref('');
const newCollectionName = ref('');
const songNumbers = ref([]);
const currentIndex = ref(-1);
const currentVariantIndex = ref(0);
const showGoToPopover = ref(false);
const gotoNumber = ref(null);
const gotoInput = ref(null);
const showSearchPopover = ref(false);
const searchInput = ref(null);
const allSongs = ref([]);

const maxSongNumber = computed(() => songNumbers.value.length ? Math.max(...songNumbers.value) : 0)

// Отображаемая метка текущего варианта
const currentVariantLabel = computed(() => {
  if (!song.value?.variants) return ''
  const label = song.value.variants[currentVariantIndex.value]?.label
  return label || ''
})

onMounted(async () => {
  const songNumber = parseInt(route.params.number);
  currentVariantIndex.value = route.query.v !== undefined ? parseInt(route.query.v) || 0 : 0

  songNumbers.value = await getSongNumbers()
  song.value = await getSong(songNumber);
  currentIndex.value = songNumbers.value.indexOf(songNumber)

  if (!song.value) {
    loading.value = false;
    return;
  }

  // Загружаем коллекции, в которые входит песня
  songCollections.value = await getCollectionsForSong(songNumber);

  // Загружаем доступные коллекции для текущего варианта
  collections.value = await getAvailableCollections(songNumber, currentVariantIndex.value);

  // Загружаем все песни для поиска
  allSongs.value = await getAllSongs()
  buildIndex(allSongs.value)

  loading.value = false;
});

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < songNumbers.value.length - 1)
const prevSongNumber = computed(() => hasPrev.value ? songNumbers.value[currentIndex.value - 1] : null)
const nextSongNumber = computed(() => hasNext.value ? songNumbers.value[currentIndex.value + 1] : null)

const goToSong = (number) => {
  router.push(`/song/${number}`)
}

const closeGoToPopover = () => {
  showGoToPopover.value = false
  gotoNumber.value = null
}

const closeSearchPopover = () => {
  showSearchPopover.value = false
  searchQuery.value = ''
  searchResults.value = []
}

const handleSearch = () => {
  search(searchQuery.value, 10)
}

const getSearchSongTitle = (n) => {
  const s = allSongs.value.find(s => Number(s.number) === Number(n))
  return s ? s.title : 'Неизвестная песня'
}

const goToSongFromSearch = (n) => {
  showSearchPopover.value = false
  searchQuery.value = ''
  searchResults.value = []
  router.push(`/song/${n}`)
}

const goToSongFromPopover = () => {
  const num = parseInt(gotoNumber.value)
  if (num && songNumbers.value.includes(num)) {
    if (num === song.value.number) {
      // Тот же номер — просто закрываем popover, не трогаем URL
      showGoToPopover.value = false
      gotoNumber.value = null
    } else {
      showGoToPopover.value = false
      gotoNumber.value = null
      router.push(`/song/${num}`)
    }
  }
}

// Фокус на инпут при открытии popover
watch(showGoToPopover, (val) => {
  if (val) {
    nextTick(() => {
      gotoInput.value?.focus()
    })
  }
})

// Фокус на поисковый инпут при открытии
watch(showSearchPopover, (val) => {
  if (val) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Закрываем popover при смене маршрута
watch(() => route.params.number, () => {
  showGoToPopover.value = false
  gotoNumber.value = null
  showSearchPopover.value = false
  searchQuery.value = ''
  searchResults.value = []
})

const onVariantChange = async (index) => {
  currentVariantIndex.value = index

  // Обновляем URL query param без перезагрузки
  if (index > 0) {
    router.replace({ query: { v: index } })
  } else {
    router.replace({ query: {} })
  }

  // Обновляем список доступных коллекций для нового варианта
  if (song.value) {
    collections.value = await getAvailableCollections(song.value.number, index)
  }
}

// Получить отображаемую метку варианта по индексу
const getVariantLabel = (variantIndex) => {
  if (!song.value?.variants) return ''
  const label = song.value.variants[variantIndex]?.label
  return label || ''
}

// Ссылка на подборку
const collectionLink = (col) => {
  return `/collections/${col.id}`
}

const addToCollection = async () => {
  if (selectedCollection.value === '') {
    if (!newCollectionName.value.trim()) return;

    // Создаем новую коллекцию
    selectedCollection.value = await createCollection(newCollectionName.value);
  }

  // Добавляем текущий вариант песни в коллекцию
  await addSongToCollection(selectedCollection.value, song.value.number, currentVariantIndex.value);

  // Обновляем список коллекций песни
  songCollections.value = await getCollectionsForSong(song.value.number);

  // Обновляем список доступных коллекций
  collections.value = await getAvailableCollections(song.value.number, currentVariantIndex.value);

  // Сбрасываем выбор
  selectedCollection.value = '';
  newCollectionName.value = '';
};

const removeFromCollection = async (col) => {
  const variantLabel = getVariantLabel(col.variantIndex)
  const variantInfo = variantLabel ? ` (вариант ${variantLabel})` : ''
  if (!confirm(`Удалить песню${variantInfo} из подборки "${col.name}"?`)) return

  try {
    await removeSongFromCollection(
        Number(col.id),
        Number(route.params.number),
        col.variantIndex ?? 0
    )
    // Обновляем списки
    songCollections.value = songCollections.value.filter(
        c => !(c.id === col.id && c.variantIndex === col.variantIndex)
    )
    collections.value = await getAvailableCollections(route.params.number, currentVariantIndex.value)
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить песню')
  }
}
</script>

<style scoped>
.song-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.song-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--text);
  text-align: center;
  cursor: pointer;
}

.nav-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.2s;
}

.nav-arrow:hover {
  background: var(--bg-secondary);
}

.nav-title-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.nav-title-btn:hover {
  background: var(--bg-secondary);
}

/* Popover перехода по номеру */
.goto-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.goto-popover {
  background: var(--bg);
  border-radius: 12px;
  padding: 2rem;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.goto-popover form {
  display: flex;
  gap: 0.5rem;
}

.goto-input {
  flex: 1;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  -moz-appearance: textfield;
}

.goto-input::-webkit-outer-spin-button,
.goto-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.goto-btn {
  padding: 0.8rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 1rem;
  min-width: 80px;
}

.goto-btn:hover {
  opacity: 0.9;
}

/* Transition: fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.collections-section {
  margin-top: 2rem;
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 8px;
}

.collections-section h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--text);
}

.current-collections {
  margin-bottom: 1.5rem;
}

.current-collections ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.collection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.collection-item:last-child {
  border-bottom: none;
}

.collection-link {
  color: var(--primary);
  text-decoration: none;
  font-size: 0.95rem;
}

.collection-link:hover {
  text-decoration: underline;
}

.variant-badge {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-secondary);
}

.variant-hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: normal;
}

.add-to-collection {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.collection-select,
.collection-input {
  padding: 0.6rem 0.75rem;
  font-size: 0.95rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
  flex: 1;
  min-width: 140px;
}

.collection-input::placeholder {
  color: var(--text-secondary);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  white-space: nowrap;
  transition: opacity 0.2s;
}

.add-btn:hover {
  opacity: 0.9;
}

.remove-btn {
  padding: 0.25rem 0.5rem;
  background: none;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  transition: background 0.15s;
}

.remove-btn:hover {
  background: var(--danger);
  color: white;
}

/* Search popover */
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 400;
}

.search-popover {
  background: var(--bg);
  border-radius: 12px;
  padding: 1.5rem;
  width: 90%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.search-popover-input {
  width: 100%;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
  margin-bottom: 0.75rem;
}

.search-popover-results {
  overflow-y: auto;
  flex: 1;
}

.search-popover-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.4rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.search-popover-row:last-child {
  border-bottom: none;
}

.search-popover-row:hover {
  background: var(--bg-secondary);
}

.search-popover-row .song-number {
  font-weight: bold;
  color: var(--primary);
  margin-right: 0.5rem;
  flex-shrink: 0;
}

.search-popover-row .song-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
