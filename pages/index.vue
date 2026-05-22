<template>
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
      <Transition name="fade">
        <button v-if="showInstallButton" class="install-btn" @click="installApp">
          <Icon name="mingcute:download-2-line" size="1.1rem" />
          <span>Установить приложение</span>
        </button>
      </Transition>
    </div>
    <p class="app-version">v{{ config.appVersion }} · {{ config.appCommit }} · {{ config.appBuildDate }}</p>
  </div>
</template>

<script setup>

const config = useRuntimeConfig()
const {getAllSongs, getSongNumbers} = useIndexDB()
const pwa = usePWA()

const allSongs = ref([])
const songNumbers = ref([])
const searchComponent = ref(null)
const router = useRouter()

onMounted(async () => {
  allSongs.value = await getAllSongs()
  songNumbers.value = await getSongNumbers()

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
  margin-bottom: 2rem;
  max-width: 100%;
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

.app-version {
  margin-top: 3rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>
