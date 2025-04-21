<template>
  <div class="settings">
    <h1>Настройки</h1>

    <div class="setting-section">
      <h3>Тема приложения</h3>
      <ThemeToggle />
    </div>

    <div class="setting-section">
      <h3>Обновление базы данных</h3>
      <p>Принудительно обновить базу данных текстов песен</p>
      <button
          @click="updateSongs"
          :disabled="updating"
      >
        {{ updating ? 'Обновление...' : 'Обновить' }}
      </button>
      <p v-if="updateMessage" :class="updateSuccess ? 'success' : 'error'">
        {{ updateMessage }}
      </p>
    </div>
  </div>
</template>

<script setup>
const { fetchSongs } = useSongs();

const updating = ref(false);
const updateMessage = ref('');
const updateSuccess = ref(false);

const updateSongs = async () => {
  updating.value = true;
  updateMessage.value = '';

  try {
    const success = await fetchSongs();
    updateSuccess.value = success;
    updateMessage.value = success
        ? 'База данных успешно обновлена'
        : 'Ошибка при обновлении базы данных';
  } catch (error) {
    updateSuccess.value = false;
    updateMessage.value = 'Ошибка: ' + error.message;
  } finally {
    updating.value = false;
  }
};
</script>

<style scoped>
.settings {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.setting-section {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.success {
  color: green;
}

.error {
  color: red;
}
</style>