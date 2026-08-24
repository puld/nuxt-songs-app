<template>
  <button class="nav-btn" @click="goBack" aria-label="Назад">
    <Icon name="mingcute:arrow-left-line" size="1.5rem"/>
  </button>
</template>

<script setup>
import { backTarget } from '~/lib/navBack.js'

const router = useRouter()

/**
 * Назад по истории, а если её нет — на главную.
 *
 * Безусловный `router.back()` работал, пока в приложение заходили с главной. По
 * присланной ссылке (песня, подборка) внутренний экран оказывается первой
 * записью сессии, и та же кнопка выбрасывала из приложения. Решение — в
 * `lib/navBack.js`.
 */
const goBack = () => {
  const target = backTarget(window.history.state)

  if (target) router.push(target)
  else router.back()
}
</script>

<style scoped>
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
</style>
