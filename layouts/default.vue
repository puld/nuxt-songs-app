<script setup>
const colorMode = useColorMode()
const showNavbar = ref(true)
const lastScrollY = ref(0)
const scrollOffset = 100

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

useHead({
  link: [
    {rel: 'manifest', href: 'manifest.webmanifest'},
    {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'} // 180×180
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
    <!-- Smart Navigation Bar -->
    <nav class="app-bar" :class="{ 'app-bar-hidden': !showNavbar }">
      <NuxtLink to="/" class="nav-btn">
        <Icon name="mingcute:home-5-line" size="2rem"/>
      </NuxtLink>

      <!-- Динамический контент середины (номер песни, заголовок и т.д.) -->
      <div id="navbar-center">
        <!-- Сюда прилетит контент со страницы -->
      </div>

      <NuxtLink to="/settings" class="nav-btn">
        <Icon name="mingcute:settings-3-line" size="2rem"/>
      </NuxtLink>
    </nav>

    <div class="page-content">
      <slot/>
    </div>

    <footer class="footer">
      <p>Оффлайн сборник текстов песен © {{ new Date().getFullYear() }}</p>
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

.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  min-height: 56px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 1rem;
  z-index: 100;
  transition: transform 0.3s ease-in-out;
}

.app-bar-hidden {
  transform: translateY(-100%);
}

.page-content {
  padding-top: calc(56px + 1rem);
  padding-right: 1rem;
  padding-bottom: 1rem;
  padding-left: 1rem;
  flex: 1;
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
  text-decoration: none;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: var(--bg-secondary);
}

#navbar-center {
  flex: 1;
  overflow: hidden;
  margin: 0 0.5rem;
}

.nav-title {
  font-weight: bold;
  font-size: 1.2rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  color: var(--text);
}

@media (min-width: 640px) {
  .nav-title {
    font-size: 1.5rem;
  }
}

.footer {
  padding: 1rem;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>