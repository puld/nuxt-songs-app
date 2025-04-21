<template>
  <div class="settings">
    <h1>Настройки</h1>

    <div class="setting-section">
      <h2>Тема приложения</h2>
      <ThemeToggle />
    </div>

    <div class="setting-section">
      <h2>Размер шрифта:</h2>
      <div class="font-size-controls">
        <button
            v-for="size in fontSizes"
            :key="size.value"
            @click="setFontSize(size.value)"
            :class="{ active: settings.fontSize === size.value }"
        >
          {{ size.label }}
        </button>
      </div>
    </div>

    <div class="setting-section">
      <h2>Отображение аккордов:</h2>
      <label class="toggle-switch">
        <input
            type="checkbox"
            :checked="settings.showChords"
            @change="handleChordsToggle"
        >
        <span class="slider"></span>
        <span class="toggle-label">{{ settings.showChords ? 'Вкл' : 'Выкл' }}</span>
      </label>
    </div>

    <div class="setting-section">
      <h2>Обновление базы данных</h2>
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

import { useSettingsStore } from '~/stores/settings'

const settings = useSettingsStore()
const fontSizes = [
  { value: 'small', label: 'Меньше' },
  { value: 'medium', label: 'Стандартный' },
  { value: 'large', label: 'Больше' }
]

const setFontSize = (size) => {
  settings.setFontSize(size)
}

const handleChordsToggle = (e) => {
  settings.setShowChords(e.target.checked)
}
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

.font-size-controls {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.font-size-controls button {
  padding: 8px 15px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 4px;
  cursor: pointer;
}

.font-size-controls button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.slider {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  background-color: #ccc;
  border-radius: 24px;
  transition: .4s;
}

.slider:before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: .4s;
}

input:checked + .slider {
  background-color: var(--primary);
}

input:checked + .slider:before {
  transform: translateX(26px);
}

.toggle-label {
  margin-left: 5px;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  background-color: #ccc;
  border-radius: 24px;
  transition: .4s;
}

.slider:before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: .4s;
}

input:checked + .slider {
  background-color: var(--primary);
}

input:checked + .slider:before {
  transform: translateX(26px);
}

.toggle-label {
  user-select: none;
}
</style>