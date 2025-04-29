<script setup>
const colorMode = useColorMode()

useHead({
  link: [
    {rel: 'manifest', href: 'manifest.webmanifest'},
    {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'} // 180×180
  ],
});
</script>

<template>
  <Head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ffffff">
    <link rel="manifest" href="manifest.webmanifest">
  </Head>
  <div class="layout" :class="colorMode.value">
    <header class="header">
      <NuxtLink to="/" class="logo">Сборник песен</NuxtLink>
      <nav class="nav">
        <NuxtLink to="/collections">Мои подборки</NuxtLink>
        <NuxtLink to="/settings">Настройки</NuxtLink>
      </nav>
    </header>

    <main class="main">
      <slot/>
    </main>

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

.header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-weight: bold;
  font-size: 1.2rem;
  text-decoration: none;
  color: var(--text);
}

.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.nav a {
  text-decoration: none;
  color: var(--text);
  padding: 0.5rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav a:hover {
  background: var(--bg-secondary);
}

.nav a.router-link-active {
  font-weight: bold;
  color: var(--primary);
}

.main {
  flex: 1;
  padding: 1rem;
}

.footer {
  padding: 1rem;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>