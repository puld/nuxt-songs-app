<script setup>
const colorMode = useColorMode()
</script>

<template>
  <div class="layout" :class="colorMode.value">
    <header class="header">
      <NuxtLink to="/" class="logo">Сборник песен</NuxtLink>
      <nav class="nav">
        <NuxtLink to="/collections">Мои подборки</NuxtLink>
        <NuxtLink to="/settings">Настройки</NuxtLink>
      </nav>
    </header>

    <main class="main">
      <slot />
    </main>

    <footer class="footer">
      <p>Оффлайн сборник текстов песен © {{ new Date().getFullYear() }}</p>
    </footer>
  </div>
</template>

<style>
/* Ваши стили остаются без изменений */
</style>