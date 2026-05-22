<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <button class="nav-btn hamburger" @click="toggleSidebar" aria-label="Меню">
        <Icon name="mingcute:menu-line" size="1.5rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Сборник песен</span>
    </Teleport>
  </ClientOnly>

  <div class="welcome-screen">
    <div v-if="!allSongs.length">
      <p>Необходимо перейти в настройки и принудительно обновить базу данных текстов песен.</p>
      <NuxtLink to="/settings">Перейти в настройки для обновления</NuxtLink>
    </div>
    <div v-else>
      <div class="search-container">
        <SongSearchInput
          ref="searchComponent"
          :songs="allSongs"
          :songNumbers="songNumbers"
          max-results-height="300px"
          @select="goToSong"
        />
      </div>

      <div class="instructions">
        <ul v-if="favoriteCount === 0" class="instruction-text instruction-extended">
          <li>Ищите песни по номеру или тексту</li>
          <li>Нажмите <Icon name="mingcute:star-line" size="0.95rem" class="instruction-icon" /> на странице песни, чтобы добавить в «Избранное»</li>
          <li>Ваши подборки доступны через меню ☰</li>
        </ul>
        <p v-else class="instruction-text">
          Ищите песни по номеру или тексту. Подборки — через меню ☰.
        </p>
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

const {getAllSongs, getSongNumbers, getFavoriteCollection, getSongsCountInCollection} = useIndexDB()
const pwa = usePWA()
const toggleSidebar = inject('toggleSidebar', () => {})

const allSongs = ref([])
const songNumbers = ref([])
const favoriteCount = ref(0)
const searchComponent = ref(null)
const router = useRouter()

onMounted(async () => {
  allSongs.value = await getAllSongs()
  songNumbers.value = await getSongNumbers()

  const favorite = await getFavoriteCollection()
  if (favorite) {
    favoriteCount.value = await getSongsCountInCollection(favorite.id)
  }

  // Фокус на поле поиска
  searchComponent.value?.focus()
})

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
  return pwa.showInstallPrompt.value && !pwa.isPWAInstalled.value
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
  list-style: none;
  padding-left: 1rem;
}

.instruction-extended li {
  position: relative;
  padding-left: 1rem;
}

.instruction-extended li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--primary);
}

.instruction-icon {
  vertical-align: text-top;
}

.install-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background-color: var(--primary);
  color: #fff;
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
