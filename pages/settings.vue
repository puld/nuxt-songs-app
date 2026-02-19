<template>
  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Настройки</span>
    </Teleport>
  </ClientOnly>

  <div class="settings">
    <div class="setting-section">
      <h2>Тема приложения</h2>
      <SettingToggle
        :options="colorModeValues"
        :active-value="colorMode.preference"
        @update:value="handleColorModeChange"
      />
    </div>

    <div class="setting-section">
      <h2>Размер шрифта:</h2>
      <SettingToggle
          :options="fontSizes"
          :active-value="settings.fontSize"
          @update:value="handleFontSizeChange"
      />
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
import SettingToggle from "../components/SettingToggle.vue";

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
const colorMode = useColorMode()

const colorModeValues = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Темная' },
  { value: 'system', label: 'Как в системе' }
]

const fontSizes = [
  { value: 'small', label: 'Меньше' },
  { value: 'medium', label: 'Стандартный' },
  { value: 'large', label: 'Больше' }
]
const handleFontSizeChange = (size) => {
  settings.setFontSize(size)
}

const handleColorModeChange = (mode) => {
  colorMode.preference = mode
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