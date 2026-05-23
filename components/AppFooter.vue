<template>
  <footer class="footer">
    <span class="footer-text">Оффлайн сборник текстов песен &copy;</span>
    <span class="footer-version">v{{ appConfig.appVersion }} · {{ appConfig.appCommit }} · {{ appConfig.appBuildDate }}</span>
  </footer>
</template>

<script setup>
const appConfig = useAppConfig()
</script>

<style scoped>
.footer {
  padding: 1rem;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0 0.5rem;
}

.footer-version {
  font-size: 0.7rem;
}
</style>
