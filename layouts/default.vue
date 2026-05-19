<script setup>
const colorMode = useColorMode()
const showNavbar = ref(true)
const lastScrollY = ref(0)
const scrollOffset = 100
const sidebarOpen = ref(false)

const onScroll = () => {
  const currentScrollY = window.scrollY

  if (currentScrollY < scrollOffset) {
    showNavbar.value = true
  } else if (currentScrollY > lastScrollY.value && currentScrollY > scrollOffset) {
    showNavbar.value = false
  } else if (currentScrollY < lastScrollY.value) {
    showNavbar.value = true
  }

  lastScrollY.value = currentScrollY
}

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const closeSidebar = () => {
  sidebarOpen.value = false
}

useHead({
  link: [
    {rel: 'manifest', href: 'manifest.webmanifest'},
    {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'}
  ],
});

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <Head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ffffff">
    <link rel="manifest" href="manifest.webmanifest">
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
          <span class="sidebar-title">Меню</span>
          <button class="sidebar-close" @click="closeSidebar">
            <Icon name="mingcute:close-line" size="1.5rem"/>
          </button>
        </div>
        <nav class="sidebar-nav">
          <NuxtLink to="/" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:home-5-line" size="1.25rem"/>
            <span>Главная</span>
          </NuxtLink>
          <NuxtLink to="/collections" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:folder-line" size="1.25rem"/>
            <span>Подборки</span>
          </NuxtLink>
          <NuxtLink to="/library" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:book-6-line" size="1.25rem"/>
            <span>Библиотека</span>
          </NuxtLink>
          <NuxtLink to="/settings" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:settings-3-line" size="1.25rem"/>
            <span>Настройки</span>
          </NuxtLink>
        </nav>
      </aside>
    </Transition>

    <!-- Navigation Bar -->
    <nav class="app-bar" :class="{ 'app-bar-hidden': !showNavbar }">
      <button class="nav-btn hamburger" @click="toggleSidebar" aria-label="Меню">
        <Icon name="mingcute:menu-line" size="1.5rem"/>
      </button>

      <NuxtLink to="/" class="nav-btn">
        <Icon name="mingcute:home-5-line" size="1.5rem"/>
      </NuxtLink>

      <!-- Динамический контент середины — центрируется абсолютно -->
      <div id="navbar-center">
        <!-- Сюда прилетит контент со страницы -->
      </div>

      <NuxtLink to="/library" class="nav-btn" style="margin-left: auto;">
        <Icon name="mingcute:book-6-line" size="1.5rem"/>
      </NuxtLink>
    </nav>

    <div class="page-content">
      <slot/>
    </div>

    <footer class="footer">
      <p>Оффлайн сборник текстов песен &copy; {{ new Date().getFullYear() }}</p>
    </footer>
  </div>
</template>

<style>
.layout {
  min-height: 100vh;
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
  width: 280px;
  background: var(--bg);
  border-right: 1px solid var(--border-color);
  z-index: 300;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  height: 56px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-weight: bold;
  font-size: 1.1rem;
}

.sidebar-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.2s;
}

.sidebar-close:hover {
  background: var(--bg-secondary);
}

.sidebar-nav {
  padding: 0.5rem 0;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  color: var(--text);
  text-decoration: none;
  transition: background 0.2s;
}

.sidebar-link:hover {
  background: var(--bg-secondary);
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

/* App bar */
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

.nav-title {
  font-weight: bold;
  font-size: 1.25rem;
  color: var(--text);
  white-space: nowrap;
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

.nav-spacer { display: none; }

.footer {
  padding: 1rem;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>