<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarHamburger />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Сборник песен</span>
    </Teleport>
  </ClientOnly>

  <div class="welcome-screen">
    <div v-if="loading">
      <LoadingText text="Загрузка базы данных..." />
    </div>
    <div v-else-if="!allSongs.length">
      <p>Не удалось загрузить базу данных песен.</p>
      <NuxtLink to="/settings">Обновить в настройках</NuxtLink>
    </div>
    <div v-else>
      <div class="search-container">
        <SongSearchInput
          ref="searchComponent"
          :songs="allSongs"
          :songNumbers="songNumbers"
          @select="goToSong"
        />
      </div>

      <!-- Недавно открытые песни. Функция экспериментальная, поэтому за тем же
           гейтом, что и «Все песни». Пустой список блок не рисует. -->
      <div v-if="settings.devMode && recentSongs.length" class="recent">
        <div class="recent-title">Недавние</div>
        <NuxtLink
          v-for="item in recentSongs"
          :key="item.number"
          :to="`/song/${item.number}`"
          class="recent-item"
        >
          <span class="recent-number">{{ item.number }}</span>
          <span class="recent-name">{{ item.title }}</span>
        </NuxtLink>
      </div>

      <!-- Вход в список всех песен: пока экран экспериментальный, показываем
           его только в режиме разработчика — как и пункт меню. -->
      <NuxtLink v-if="settings.devMode" to="/songs" class="songs-link">
        <Icon name="mingcute:list-check-line" size="1.1rem" />
        <span>Все песни</span>
        <Icon name="mingcute:right-line" size="1.1rem" class="songs-link-arrow" />
      </NuxtLink>

      <div class="instructions">
        <div v-if="favoriteCount === 0" class="instruction-text instruction-extended">
          <ul class="instruction-list">
            <li>Ищите песни по номеру или тексту</li>
            <li>Нажмите <Icon name="mingcute:star-line" size="0.95rem" class="instruction-icon" /> на странице песни, чтобы добавить в «Избранное»</li>
            <li>Ваши подборки доступны через меню ☰</li>
          </ul>
          <NuxtLink to="/about" class="instruction-more">Подробнее</NuxtLink>
        </div>
        <div v-else class="instruction-text">
          Ищите песни по номеру или тексту<br>
          Подборки — через меню ☰
          <NuxtLink to="/about" class="instruction-more">Подробнее</NuxtLink>
        </div>
      </div>

      <Transition name="fade">
        <button v-if="showInstallButton" class="install-btn" @click="installApp">
          <Icon name="mingcute:download-2-line" size="1.1rem" />
          <span>Установить приложение</span>
        </button>
      </Transition>
    </div>
  </div>
</template>

<script setup>

import { useSettingsStore } from '~/stores/settings'

const {getFavoriteCollection, getSongsCountInCollection} = useIndexDB()
const {allSongs, songNumbers, songsMap, loadSongs} = useSongsCache()
const pwa = usePWA()
const settings = useSettingsStore()

const favoriteCount = ref(0)
const loading = ref(true)
const searchComponent = ref(null)
const router = useRouter()

onMounted(async () => {
  await loadSongs()
  loading.value = false

  const favorite = await getFavoriteCollection()
  if (favorite) {
    favoriteCount.value = await getSongsCountInCollection(favorite.id)
  }

  // Фокус на поле поиска
  searchComponent.value?.focus()
})

// История просмотров: номера храним в настройках, название берём из карты
// песен. Номера, которых нет в базе, отбрасываем — песня могла исчезнуть при
// обновлении, и ссылка «Неизвестная песня» пользователю ничего не даёт.
const recentSongs = computed(() =>
  settings.recentSongNumbers
    .map(number => ({ number, song: songsMap.value.get(number) }))
    .filter(item => item.song)
    .map(item => ({ number: item.number, title: item.song.title }))
)

const goToSong = ({ n, variantIndex }) => {
  if (n) {
    const query = variantIndex > 0 ? { v: variantIndex } : {}
    router.push({ path: `/song/${n}`, query })
  }
}

const installApp = () => {
  pwa.install()
}

const showInstallButton = computed(() => {
  return pwa.showInstallPrompt && !pwa.isPWAInstalled
})

</script>

<style scoped>
.welcome-screen {
  max-width: 500px;
  margin: 0 auto;
  padding: 2rem;
}

.search-container {
  margin-top: 2rem;
  margin-bottom: 1rem;
  max-width: 100%;
}

.instructions {
  margin-bottom: 2rem;
}

.recent {
  margin-bottom: 1rem;
  background: var(--bg-secondary);
  border-radius: 0.5rem;
  overflow: hidden;
}

.recent-title {
  padding: 0.5rem 1rem 0.25rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.recent-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  color: var(--text);
  text-decoration: none;
  font-size: 0.95rem;
}

.recent-item:last-child {
  padding-bottom: 0.75rem;
}

/* Номер фиксированной ширины: названия выстраиваются в колонку */
.recent-number {
  flex: 0 0 2.5rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

/* Длинное название обрезается, а не переносит блок на вторую строку */
.recent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.songs-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: var(--bg-secondary);
  border-radius: 0.5rem;
  color: var(--text);
  text-decoration: none;
  font-size: 0.95rem;
}

.songs-link-arrow {
  margin-left: auto;
  color: var(--text-secondary);
}

.instruction-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.6;
  margin: 0;
}

.instruction-extended {
  text-align: left;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-radius: 0.5rem;
}

.instruction-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.instruction-list li {
  position: relative;
  padding-left: 1rem;
}

.instruction-list li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--primary);
}

.instruction-icon {
  vertical-align: text-top;
}

/* Ссылка на шпаргалку — последняя строка плашки с краткой инструкцией */
.instruction-more {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: none;
}

.install-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background-color: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.install-btn:active {
  opacity: 0.8;
}
</style>
