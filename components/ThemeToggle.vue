<script setup>
const colorMode = useColorMode()
</script>

<template>
  <div class="theme-toggle">
    <button
        :class="{ active: colorMode.value === 'light' }"
        @click="colorMode.preference = 'light'"
    >
      Светлая
    </button>
    <button
        :class="{ active: colorMode.value === 'dark' }"
        @click="colorMode.preference = 'dark'"
    >
      Темная
    </button>
    <button
        :class="{ active: colorMode.value === 'system' }"
        @click="colorMode.preference = 'system'"
    >
      Как в системе
    </button>
  </div>
</template>