<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarHamburger />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Все песни</span>
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-right" v-if="settings.devMode">
      <button class="nav-btn" @click="openSearch" aria-label="Найти песню">
        <Icon name="mingcute:search-line" size="1.5rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <!-- Поиск и переход к песне: тот же попап, что на странице песни -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showSearch" class="goto-overlay" :style="overlayStyle" @click.self="closeSearch">
        <div class="goto-popover" ref="searchPopoverEl">
          <SongSearchInput
            ref="searchComponent"
            :songs="allSongs"
            :songNumbers="songNumbers"
            max-width="100%"
            max-results-height="none"
            @select="onSearchSelect"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <div class="songs-page">
    <!-- Гейт скрывает вход в меню, но прямой URL остаётся рабочим (ssr: false —
         статика генерируется для всех маршрутов). Показываем объяснение,
         иначе случайный переход выглядит как поломка. -->
    <div v-if="!settings.devMode" class="stub">
      <p class="stub-title">Экспериментальный экран</p>
      <p class="stub-text">Список всех песен пока доступен только в режиме разработчика.</p>
      <NuxtLink to="/" class="stub-link">На главную</NuxtLink>
    </div>

    <template v-else>
      <div class="modes" role="tablist">
        <button
          v-for="mode in MODES"
          :key="mode.value"
          class="mode-btn"
          :class="{ active: activeMode === mode.value }"
          role="tab"
          :aria-selected="activeMode === mode.value"
          @click="setMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>

      <LoadingText v-if="loading" />

      <p v-else-if="groups.length === 0" class="empty">
        Песен пока нет. Загрузите базу в настройках.
      </p>

      <div v-else class="groups">
        <section v-for="group in groups" :key="group.key" class="group">
          <button
            class="group-header"
            :aria-expanded="isOpen(group.key)"
            @click="toggleGroup(group.key)"
          >
            <Icon
              :name="isOpen(group.key) ? 'mingcute:down-line' : 'mingcute:right-line'"
              size="1.1rem"
              class="group-chevron"
            />
            <span class="group-title">{{ group.title }}</span>
            <span class="group-count">{{ group.songs.length }}</span>
          </button>

          <div v-if="isOpen(group.key)" class="songs-list">
            <NuxtLink
              v-for="song in group.songs"
              :key="song.number"
              :to="`/song/${song.number}`"
              class="song-link"
            >
              <span class="song-number">{{ song.number }}</span>
              <span class="song-title">{{ song.title }}</span>
            </NuxtLink>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { groupSongs, normalizeSongsListMode } from '~/lib/songsList'

const MODE_LABELS = {
  number: 'По номеру',
  alphabet: 'По алфавиту',
  sections: 'По разделам'
}

const MODES = Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))

const router = useRouter()
const settings = useSettingsStore()
const { getSections } = useIndexDB()
const { allSongs, songNumbers, loadSongs } = useSongsCache()

const sections = ref([])
const loading = ref(true)
const openKeys = ref(new Set())

// Режим живёт в настройках, а не в локальном ref: выбранная группировка
// переживает уход со страницы и перезапуск приложения.
const activeMode = computed(() => normalizeSongsListMode(settings.songsListMode))

const showSearch = ref(false)
const searchPopoverEl = ref(null)
const searchComponent = ref(null)
const { overlayStyle } = useKeyboardOffset(showSearch, searchPopoverEl)

const groups = computed(() => groupSongs(activeMode.value, allSongs.value, sections.value))

const isOpen = (key) => openKeys.value.has(key)

const toggleGroup = (key) => {
  const next = new Set(openKeys.value)
  next.has(key) ? next.delete(key) : next.add(key)
  openKeys.value = next
}

/**
 * Первая группа открыта, остальные свёрнуты: 1565 песен разом не рендерим,
 * но и пустой экран из одних заголовков не показываем.
 */
const resetOpenGroups = () => {
  const [first] = groups.value
  openKeys.value = new Set(first ? [first.key] : [])
}

const setMode = (mode) => {
  if (activeMode.value === mode) return
  settings.setSongsListMode(mode)
  resetOpenGroups()
}

const openSearch = async () => {
  showSearch.value = true
  await nextTick()
  searchComponent.value?.focus()
}

const closeSearch = () => {
  showSearch.value = false
  searchComponent.value?.clear()
}

const onSearchSelect = ({ n, variantIndex }) => {
  closeSearch()
  router.push({ path: `/song/${n}`, query: variantIndex > 0 ? { v: variantIndex } : {} })
}

onMounted(async () => {
  try {
    const [, loadedSections] = await Promise.all([loadSongs(), getSections()])
    sections.value = loadedSections
    resetOpenGroups()
  } catch (error) {
    console.error('Ошибка загрузки списка песен:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.songs-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem;
}

.modes {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 0.25rem;
}

.mode-btn {
  flex: 1;
  padding: 0.5rem 0.25rem;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
}

.mode-btn.active {
  background: var(--bg);
  color: var(--text);
  font-weight: 500;
}

.group {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 0.8rem;
  background: var(--bg-secondary);
  border: none;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.group-chevron {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.group-title {
  flex-grow: 1;
  font-size: 0.9rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.songs-list {
  border-top: 1px solid var(--border-color);
}

.song-link {
  display: flex;
  align-items: center;
  padding: 0.85rem 0.8rem;
  border-bottom: 1px solid var(--border-color);
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}

.song-link:last-child {
  border-bottom: none;
}

.song-link:hover {
  background-color: var(--bg-secondary);
}

.song-number {
  font-weight: bold;
  min-width: 2.5rem;
  text-align: right;
  margin-right: 0.5rem;
  color: var(--primary);
  flex-shrink: 0;
}

.song-title {
  flex-grow: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  color: var(--text-secondary);
}

.stub {
  text-align: center;
  padding: 2rem 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.stub-title {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.stub-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.stub-link {
  color: var(--primary);
  text-decoration: none;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
}

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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
