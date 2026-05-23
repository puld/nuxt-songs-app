<template>
  <div class="loading-wrap">
    <div class="loading-spinner"></div>
    <p class="loading-text">{{ text }}</p>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: 'Загрузка...' }
})
</script>

<style scoped>
.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 3rem;
  gap: 1rem;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin: 0;
}
</style>
