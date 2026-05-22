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

  <ClientOnly>
    <!-- Навбар: звезда избранного -->
    <Teleport to="#navbar-right" v-if="song">
      <button class="favorite-star" :class="{ active: isSongFavorite }" @click="toggleFavorite" aria-label="Избранное">
        <Icon :name="isSongFavorite ? 'mingcute:star-fill' : 'mingcute:star-line'" size="1.5rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <!-- Popover для поиска и перехода -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showGoToPopover" class="goto-overlay" @click.self="closeGoToPopover">
        <div class="goto-popover">
          <SongSearchInput
            ref="searchComponent"
            :songs="allSongs"
            :songNumbers="songNumbers"
            max-width="100%"
            max-results-height="none"
            @select="onPopoverSelect"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Попап добавления в подборку -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showAddPopup" class="popup-overlay" @click.self="showAddPopup = false">
        <div class="popup-content">
          <h3 class="popup-title">Добавить в подборку</h3>
          <div class="popup-collections">
            <button
              v-for="col in displayAvailableCollections"
              :key="col.id"
              class="popup-collection-item"
              @click="addSongToPopupCollection(col)"
            >
              {{ col.name }}
            </button>
            <div v-if="displayAvailableCollections.length === 0" class="popup-empty">
              Нет доступных подборок
            </div>
          </div>
          <div class="popup-divider"></div>
          <form class="popup-create" @submit.prevent="createAndAddCollection">
            <input v-model="newCollectionName" placeholder="Новая подборка" class="popup-input">
            <button type="submit" class="popup-create-btn" :disabled="!newCollectionName.trim()">Создать</button>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

  <div v-if="loading">Загрузка...</div>
  <div v-else-if="song">
    <!-- Название песни -->
    <div class="song-title-row" :class="fontSizeClass">
      <h1 class="song-title" :class="fontSizeClass">{{ song.title }}</h1>
    </div>

    <SongDisplay
      :song="song"
      :initialVariantIndex="currentVariantIndex"
      @variant-change="onVariantChange"
    />

    <!-- Чипы подборок + кнопка добавить -->
    <div class="collections-section">
      <div class="collections-chips">
        <NuxtLink
          v-for="col in displayCollections"
          :key="col.id + '-' + col.variantIndex"
          :to="collectionLink(col)"
          class="collection-chip"
        >
          <span class="chip-name">{{ col.name }}</span>
          <span v-if="getVariantLabel(col.variantIndex)" class="variant-badge">{{ getVariantLabel(col.variantIndex) }}</span>
          <button class="chip-remove" @click.prevent="removeFromCollection(col)" aria-label="Удалить из подборки">×</button>
        </NuxtLink>
        <button class="chip-add" @click="openAddPopup" aria-label="Добавить в подборку">+</button>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Песня не найдена</p>
    <NuxtLink to="/">Вернуться на главную</NuxtLink>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

const route = useRoute();
const router = useRouter()
const settings = useSettingsStore()
const {
  getSong,
  getSongNumbers,
  createCollection,
  getCollectionsForSong,
  addSongToCollection,
  getAvailableCollections,
  removeSongFromCollection,
  getAllSongs,
  isSongInFavorite,
  addToFavorite,
  removeFromFavorite
} = useIndexDB();

const song = ref(null);
const loading = ref(true);
const availableCollections = ref([]);
const songCollections = ref([]);
const newCollectionName = ref('');
const songNumbers = ref([]);
const allSongs = ref([]);
const currentIndex = ref(-1);
const currentVariantIndex = ref(0);
const showGoToPopover = ref(false);
const showAddPopup = ref(false);
const searchComponent = ref(null);
const isSongFavorite = ref(false);

// Подборки без «Избранного» — для чипов
const displayCollections = computed(() =>
  songCollections.value.filter(c => !c.isFavorite)
)

// Доступные подборки без «Избранного» — для попапа
const displayAvailableCollections = computed(() =>
  availableCollections.value.filter(c => !c.isFavorite)
)

const fontSizeClass = computed(() => `font-size-${settings.fontSize}`)

// Отображаемая метка текущего варианта
const currentVariantLabel = computed(() => {
  if (!song.value?.variants) return ''
  const label = song.value.variants[currentVariantIndex.value]?.label
  return label || ''
})

onMounted(async () => {
  try {
    const songNumber = parseInt(route.params.number);
    currentVariantIndex.value = route.query.v !== undefined ? parseInt(route.query.v) || 0 : 0

    songNumbers.value = await getSongNumbers()
    allSongs.value = await getAllSongs()
    song.value = await getSong(songNumber);
    currentIndex.value = songNumbers.value.indexOf(songNumber)

    if (!song.value) {
      loading.value = false;
      return;
    }

    // Загружаем коллекции, в которые входит песня
    songCollections.value = await getCollectionsForSong(songNumber);

    // Загружаем доступные коллекции для текущего варианта
    availableCollections.value = await getAvailableCollections(songNumber, currentVariantIndex.value);

    // Проверяем, в избранном ли песня
    isSongFavorite.value = await isSongInFavorite(songNumber, currentVariantIndex.value);
  } catch (error) {
    console.error('Ошибка загрузки песни:', error);
  } finally {
    loading.value = false;
  }
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
  searchComponent.value?.clear()
}

const onPopoverSelect = async ({ n, variantIndex }) => {
  closeGoToPopover()
  if (Number(n) === song.value?.number) {
    // Тот же номер — обновляем вариант напрямую
    currentVariantIndex.value = variantIndex
    // Обновляем список доступных коллекций для нового варианта
    availableCollections.value = await getAvailableCollections(Number(n), variantIndex)
    // Обновляем состояние избранного
    isSongFavorite.value = await isSongInFavorite(Number(n), variantIndex)
    // Обновляем URL без перезагрузки
    router.replace({ query: variantIndex > 0 ? { v: variantIndex } : {} })
  } else {
    const query = variantIndex > 0 ? { v: variantIndex } : {}
    router.push({ path: `/song/${n}`, query })
  }
}

// Фокус на инпут при открытии popover
watch(showGoToPopover, (val) => {
  if (val) {
    nextTick(() => {
      searchComponent.value?.focus()
    })
  }
})

// Закрываем popover при смене маршрута
watch(() => route.params.number, () => {
  showGoToPopover.value = false
  searchComponent.value?.clear()
})

const onVariantChange = async (index) => {
  currentVariantIndex.value = index

  // Обновляем URL query param без перезагрузки
  if (index > 0) {
    router.replace({ query: { v: index } })
  } else {
    router.replace({ query: {} })
  }

  // Обновляем списки для нового варианта
  if (song.value) {
    availableCollections.value = await getAvailableCollections(song.value.number, index)
    isSongFavorite.value = await isSongInFavorite(song.value.number, index)
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

const openAddPopup = () => {
  newCollectionName.value = ''
  showAddPopup.value = true
}

const refreshCollections = async () => {
  if (!song.value) return
  songCollections.value = await getCollectionsForSong(song.value.number)
  availableCollections.value = await getAvailableCollections(song.value.number, currentVariantIndex.value)
  isSongFavorite.value = await isSongInFavorite(song.value.number, currentVariantIndex.value)
}

const addSongToPopupCollection = async (col) => {
  try {
    await addSongToCollection(col.id, song.value.number, currentVariantIndex.value)
    showAddPopup.value = false
    await refreshCollections()
  } catch (error) {
    console.error('Ошибка добавления:', error)
    if (error.message !== 'Этот вариант песни уже есть в подборке') {
      alert('Не удалось добавить песню')
    }
  }
}

const createAndAddCollection = async () => {
  if (!newCollectionName.value.trim()) return
  try {
    const collectionId = await createCollection(newCollectionName.value.trim())
    await addSongToCollection(collectionId, song.value.number, currentVariantIndex.value)
    showAddPopup.value = false
    newCollectionName.value = ''
    await refreshCollections()
  } catch (error) {
    console.error('Ошибка создания подборки:', error)
    alert('Не удалось создать подборку')
  }
}

const toggleFavorite = async () => {
  try {
    if (isSongFavorite.value) {
      await removeFromFavorite(song.value.number, currentVariantIndex.value)
    } else {
      await addToFavorite(song.value.number, currentVariantIndex.value)
    }
    await refreshCollections()
  } catch (error) {
    console.error('Ошибка переключения избранного:', error)
  }
}

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
    await refreshCollections()
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить песню')
  }
}
</script>

<style scoped>
/* Строка заголовка песни + звёздочка избранного
   Ширина совпадает с .song-content-wrapper в SongDisplay.vue,
   чтобы звезда была прижата к правому краю колонки текста песни.
   ВНИМАНИЕ: Брейкпоинты ширины синхронизированы с .song-content-wrapper
   в components/SongDisplay.vue — при рефакторинге менять оба места. */
.song-title-row {
  margin-bottom: 1.5rem;
  width: 100%;
  margin-left: auto;
  margin-right: auto;

  /* xs: сужаем чтобы «Припев:» не выходил за экран */
  @media (min-width: 480px) {
    width: 90%;
  }

  /* sm: 10/12 = 83.33% */
  @media (min-width: 640px) {
    width: 83.33%;
  }

  /* md: 8/12 = 66.67% */
  @media (min-width: 768px) {
    width: 66.67%;
  }

  /* lg: 6/12 = 50% */
  @media (min-width: 1024px) {
    width: 50%;
  }
}

/* Средний/крупный шрифт: уже колонка на xs (синхронно с SongDisplay) */
@media (min-width: 480px) {
  .song-title-row.font-size-medium {
    width: 85%;
  }

  .song-title-row.font-size-large {
    width: 95%;
  }
}

@media (min-width: 640px) {
  .song-title-row.font-size-medium {
    width: 83.33%;
  }

  .song-title-row.font-size-large {
    width: 95%;
  }
}

@media (min-width: 768px) {
  .song-title-row.font-size-large {
    width: 66.67%;
  }
}

/* Средний/крупный шрифт: ограничение ширины на широких десктопах */
@media (min-width: 1024px) {
  .song-title-row.font-size-medium {
    max-width: 40rem;
  }

  .song-title-row.font-size-large {
    max-width: 35rem;
  }
}

.song-title {
  font-weight: bold;
  color: var(--text);
  text-align: center;
  margin: 0;
}

.song-title.font-size-small {
  font-size: 17px;
}

.song-title.font-size-medium {
  font-size: 23px;
}

.song-title.font-size-large {
  font-size: 29px;
}

.favorite-star {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  line-height: 1;
  transition: color 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.favorite-star:hover {
  background: var(--bg-secondary);
  transform: scale(1.1);
}

.favorite-star.active {
  color: #f59e0b;
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

/* Popover перехода */
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
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Попап добавления в подборку */
.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.popup-content {
  background: var(--bg);
  border-radius: 12px;
  padding: 1.5rem;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.popup-title {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: var(--text);
}

.popup-collections {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 250px;
  overflow-y: auto;
}

.popup-collection-item {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
  text-align: left;
  color: var(--text);
  font-size: 0.9rem;
  transition: background 0.15s;
}

.popup-collection-item:hover {
  background: var(--bg-secondary);
}

.popup-empty {
  color: var(--text-secondary);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}

.popup-divider {
  border-top: 1px solid var(--border-color);
  margin: 1rem 0;
}

.popup-create {
  display: flex;
  gap: 0.5rem;
}

.popup-input {
  flex: 1;
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}

.popup-create-btn {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  white-space: nowrap;
}

.popup-create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Чипы подборок */
.collections-section {
  margin-top: 2rem;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.collections-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.collection-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  color: var(--text);
  text-decoration: none;
  font-size: 0.85rem;
  transition: background 0.15s;
}

.collection-chip:hover {
  background: var(--border-color);
}

.chip-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-badge {
  display: inline-block;
  padding: 0.1rem 0.3rem;
  font-size: 0.7rem;
  background: var(--border-color);
  border-radius: 3px;
  color: var(--text-secondary);
}

.chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.1rem;
  transition: color 0.15s;
}

.chip-remove:hover {
  color: var(--danger);
}

.chip-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px dashed var(--border-color);
  background: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 1.1rem;
  transition: border-color 0.15s, color 0.15s;
}

.chip-add:hover {
  border-color: var(--primary);
  color: var(--primary);
}
</style>
