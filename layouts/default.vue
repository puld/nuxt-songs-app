<script setup>
import { useSettingsStore } from '~/stores/settings'

const colorMode = useColorMode()
const settings = useSettingsStore()

const { showNavbar, autoUpdate, showToast, onUpdateApplied } = useLayoutCommon()

// Sidebar
const sidebarOpen = ref(false)
const sidebarCollections = ref([])
const { getCollections, getSongsCountInCollection } = useIndexDB()

const loadSidebarCollections = async () => {
  const collections = await getCollections()
  const withCounts = await Promise.all(
    collections.map(async (c) => ({
      ...c,
      songsCount: await getSongsCountInCollection(c.id)
    }))
  )
  const favorite = withCounts.find(c => c.isFavorite)
  const others = withCounts
    .filter(c => !c.isFavorite)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  sidebarCollections.value = favorite ? [favorite, ...others] : others
}

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
  if (sidebarOpen.value) {
    loadSidebarCollections()
  }
}

const closeSidebar = () => {
  sidebarOpen.value = false
}

// Provide для компонентов NavBarHamburger / NavBarBack
provide('toggleSidebar', toggleSidebar)
provide('updateAvailable', autoUpdate.updateAvailable)
</script>

<template>
  <Head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ffffff">
  </Head>
  <div class="layout" :class="colorMode.value">
    <!-- Overlay -->
    <Transition name="fade">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>
    </Transition>

    <!-- Sidebar -->
    <Transition name="slide">
      <aside v-if="sidebarOpen" class="sidebar">
        <div class="sidebar-header">
          <button class="sidebar-close-btn" @click="closeSidebar">
            <Icon name="mingcute:close-line" size="1.5rem"/>
          </button>
          <span class="sidebar-title">Меню</span>
        </div>
        <nav class="sidebar-nav">
          <NuxtLink to="/" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:home-5-line" size="1.25rem"/>
            <span>Главная</span>
          </NuxtLink>

          <div class="sidebar-divider"></div>

          <div class="sidebar-section-header">
            <span>Подборки</span>
          </div>

          <div class="sidebar-collections">
            <NuxtLink
              v-for="collection in sidebarCollections"
              :key="collection.id"
              :to="`/collections/${collection.id}`"
              class="sidebar-link sidebar-collection-link"
              @click="closeSidebar"
            >
              <Icon
                :name="collection.isFavorite ? 'mingcute:star-fill' : 'mingcute:folder-line'"
                :class="{ 'favorite-icon': collection.isFavorite }"
                size="1.25rem"
              />
              <span class="sidebar-collection-name">{{ collection.name }}</span>
              <span class="sidebar-collection-count">{{ collection.songsCount }}</span>
            </NuxtLink>
          </div>

        </nav>

        <div class="sidebar-bottom">
          <NuxtLink to="/settings" class="sidebar-link" @click="closeSidebar">
            <span class="sidebar-link-icon-wrap">
              <Icon name="mingcute:settings-3-line" size="1.25rem"/>
              <span v-if="autoUpdate.updateAvailable.value" class="update-badge"></span>
            </span>
            <span>Настройки</span>
          </NuxtLink>
        </div>
      </aside>
    </Transition>

    <!-- Navigation Bar -->
    <nav class="app-bar" :class="{ 'app-bar-hidden': !showNavbar }">
      <div id="navbar-left"></div>
      <div id="navbar-center"></div>
      <div id="navbar-right"></div>
    </nav>

    <div class="page-content">
      <slot/>
    </div>

    <AppFooter />

    <UpdateToast v-model="showToast" @applied="onUpdateApplied"/>
  </div>
</template>

<style>
.layout {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  transition: background 0.3s, color 0.3s;
}

/* Sidebar overlay */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 300px;
  background: var(--bg);
  border-right: 1px solid var(--border-color);
  z-index: 300;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  height: 56px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-weight: bold;
  font-size: 1.1rem;
}

.sidebar-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  flex-shrink: 0;
  transition: background 0.2s;
}

.sidebar-close-btn:hover {
  background: var(--bg-secondary);
}

.sidebar-nav {
  padding: 0.5rem 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1.25rem;
  color: var(--text);
  text-decoration: none;
  transition: background 0.2s;
}

.sidebar-link:hover {
  background: var(--bg-secondary);
}

.sidebar-divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.25rem 1rem;
}

.sidebar-section-header {
  padding: 0.5rem 1.25rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.sidebar-collections {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.sidebar-collection-link {
  padding: 0.75rem 1.25rem;
}

.sidebar-collection-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-collection-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.favorite-icon {
  color: #f59e0b;
}

.sidebar-bottom {
  border-top: 1px solid var(--border-color);
  padding: 0.25rem 0;
}

.sidebar-link-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.update-badge {
  position: absolute;
  top: -3px;
  right: -5px;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
}

/* Transition: sidebar slide */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

/* Transition: overlay fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Navigation Bar */
.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 1rem;
  z-index: 100;
  transition: transform 0.3s ease-in-out;
}

.app-bar-hidden {
  transform: translateY(-100%);
}

#navbar-left {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

#navbar-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

#navbar-right {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.25rem;

  /* Синхронизация с шириной контента песни (song-title-row, song-content-wrapper)
     ВНИМАНИЕ: Брейкпоинты ширины синхронизированы с .song-content-wrapper
     в components/SongDisplay.vue — при рефакторинге менять оба места. */
  @media (min-width: 480px) {
    right: calc((100% - 90%) / 2);
  }

  @media (min-width: 640px) {
    right: calc((100% - 83.33%) / 2);
  }

  @media (min-width: 768px) {
    right: calc((100% - 66.67%) / 2);
  }

  @media (min-width: 1024px) {
    right: calc((100% - 50%) / 2);
  }
}

/* Средний/крупный шрифт: уже колонка на xs (синхронно с SongDisplay) */
@media (min-width: 480px) {
  .font-size-medium #navbar-right {
    right: calc((100% - 85%) / 2);
  }

  .font-size-large #navbar-right {
    right: calc((100% - 95%) / 2);
  }
}

@media (min-width: 640px) {
  .font-size-medium #navbar-right {
    right: calc((100% - 83.33%) / 2);
  }

  .font-size-large #navbar-right {
    right: calc((100% - 95%) / 2);
  }
}

@media (min-width: 768px) {
  .font-size-large #navbar-right {
    right: calc((100% - 66.67%) / 2);
  }
}

/* Средний/крупный шрифт на десктопе: учитываем max-width колонки через max() */
@media (min-width: 1024px) {
  .font-size-medium #navbar-right {
    right: max(calc((100% - 50%) / 2), calc((100% - 40rem) / 2));
  }

  .font-size-large #navbar-right {
    right: max(calc((100% - 50%) / 2), calc((100% - 35rem) / 2));
  }
}

.page-content {
  padding-top: calc(56px + 1rem);
  flex: 1;
  padding-left: 1rem;
  padding-right: 1rem;
  padding-bottom: 1rem;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: var(--bg-secondary);
}

.nav-btn-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-title {
  font-weight: bold;
  font-size: 1.25rem;
  color: var(--text);
  white-space: nowrap;
}
</style>
