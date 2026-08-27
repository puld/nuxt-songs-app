<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

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

    <!-- Тумблер аккордов — за режимом разработчика: сама разметка аккордов
         в текстах песен ещё не расставлена (5.4 в дорожной карте), поэтому
         обычному пользователю переключатель ничего не меняет на экране. -->
    <div v-if="settings.devMode" class="setting-section">
      <h2>Отображение аккордов:</h2>
      <label class="toggle-switch chords-toggle">
        <input
            type="checkbox"
            :checked="settings.showChords"
            @change="handleChordsToggle"
        >
        <span class="slider"></span>
        <span class="toggle-label">{{ settings.showChords ? 'Вкл' : 'Выкл' }}</span>
      </label>

      <!-- Заблокирован, а не скрыт, пока аккорды выключены: исчезающая строка
           дёргала бы секцию при каждом переключении, а о самой возможности
           упростить аккорды узнать было бы неоткуда. -->
      <label class="toggle-switch sub-toggle" :class="{ disabled: !settings.showChords }">
        <input
            type="checkbox"
            :checked="settings.hideChordBass"
            :disabled="!settings.showChords"
            @change="handleChordBassToggle"
        >
        <span class="slider"></span>
        <span class="toggle-label">Без басов: G/B → G</span>
      </label>
      <p class="setting-hint">
        Прячет то, что записано после косой черты. Аккомпаниатору обращения нужны,
        поющему по бумажке — мешают.
      </p>
    </div>

    <div class="setting-section">
      <h2>Не гасить экран:</h2>
      <label class="toggle-switch">
        <input
            type="checkbox"
            :checked="settings.keepScreenOn"
            @change="handleKeepScreenOnToggle"
        >
        <span class="slider"></span>
        <span class="toggle-label">{{ settings.keepScreenOn ? 'Вкл' : 'Выкл' }}</span>
      </label>
      <p class="setting-hint">Экран не будет гаснуть при открытом приложении</p>
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

    <div class="setting-section" data-testid="backup-section">
      <h2>Резервная копия подборок</h2>
      <p v-if="settings.devMode">
        Сохраните подборки в файл, чтобы перенести их на другое устройство или вернуть после переустановки
      </p>
      <p v-else>
        Сохраните подборки в файл — копия пригодится, если данные пропадут
      </p>
      <div class="backup-actions">
        <button :disabled="backupBusy" data-testid="backup-export" @click="exportCollections">
          Сохранить в файл
        </button>
        <!-- Импорт — за режимом разработчика: он меняет содержимое базы,
             и ошибиться файлом проще, чем кажется -->
        <button
            v-if="settings.devMode"
            :disabled="backupBusy"
            data-testid="backup-import"
            @click="pickBackupFile"
        >
          Загрузить из файла
        </button>
      </div>
      <input
          v-if="settings.devMode"
          ref="backupFileInput"
          type="file"
          accept="application/json,.json"
          class="backup-file-input"
          data-testid="backup-file-input"
          @change="importCollections"
      >
      <p v-if="backupMessage" :class="backupSuccess ? 'success' : 'error'" data-testid="backup-message">
        {{ backupMessage }}
      </p>
      <p class="setting-hint">
        Копия содержит только названия подборок и номера песен — тексты в неё не входят.
        <template v-if="settings.devMode">
          Загрузка ничего не удаляет: недостающие подборки добавятся к текущим.
        </template>
      </p>
    </div>

    <!-- Секция появляется только при включённом режиме разработчика
         (включается семью тапами по версии на странице «О приложении»). -->
    <div v-if="settings.devMode" class="setting-section experimental-section">
      <h2>Экспериментальные функции</h2>
      <p class="setting-hint experimental-hint">
        Функции в разработке: могут работать нестабильно и меняться без предупреждения.
      </p>
      <label class="toggle-switch">
        <input
            type="checkbox"
            :checked="settings.devMode"
            @change="handleDevModeToggle"
        >
        <span class="slider"></span>
        <span class="toggle-label">Режим разработчика</span>
      </label>
      <p class="setting-hint">Выключение скроет экспериментальные функции и эту секцию</p>
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

const handleChordBassToggle = (e) => {
  settings.setHideChordBass(e.target.checked)
}

const handleKeepScreenOnToggle = (e) => {
  settings.setKeepScreenOn(e.target.checked)
}

const handleDevModeToggle = (e) => {
  settings.setDevMode(e.target.checked)
}

// === Резервная копия подборок ===
import { backupFileName, isTrivialBackup } from '~/lib/collectionsBackup'

const { exportToText, importFromText } = useCollectionsBackup()
const { pluralize } = useUtils()

const backupFileInput = ref(null)
const backupBusy = ref(false)
const backupMessage = ref('')
const backupSuccess = ref(false)

const { downloadText } = useFileDownload()

const exportCollections = async () => {
  backupBusy.value = true
  backupMessage.value = ''

  try {
    const { text, backup, stats } = await exportToText()

    // «Избранное» есть всегда — пустая база даёт файл с одной пустой
    // подборкой, скачивать который бессмысленно
    if (isTrivialBackup(backup)) {
      backupSuccess.value = false
      backupMessage.value = 'Подборок пока нет — сохранять нечего'
      return
    }

    downloadText(text, backupFileName(backup.savedAt))
    backupSuccess.value = true
    backupMessage.value = `Сохранено: ${stats.collections} ${pluralizeCollections(stats.collections)}, `
        + `${stats.links} ${pluralizeSongs(stats.links)}`
  } catch (error) {
    backupSuccess.value = false
    backupMessage.value = 'Не удалось сохранить: ' + error.message
  } finally {
    backupBusy.value = false
  }
}

const pickBackupFile = () => {
  backupMessage.value = ''
  backupFileInput.value?.click()
}

const importCollections = async (event) => {
  const file = event.target.files?.[0]
  // Диалог закрыли без выбора
  if (!file) return

  backupBusy.value = true
  backupMessage.value = ''

  try {
    const imported = await importFromText(await file.text())

    if (!imported.ok) {
      backupSuccess.value = false
      backupMessage.value = imported.error
      return
    }

    const { collections, songs, skipped } = imported.result
    backupSuccess.value = true
    backupMessage.value = `Добавлено: ${collections} ${pluralizeCollections(collections)}, `
        + `${songs} ${pluralizeSongs(songs)}`
        + (skipped ? `; уже были: ${skipped}` : '')
  } catch (error) {
    backupSuccess.value = false
    backupMessage.value = 'Не удалось прочитать файл: ' + error.message
  } finally {
    backupBusy.value = false
    // Иначе повторный выбор того же файла не вызовет change
    event.target.value = ''
  }
}

const pluralizeCollections = (n) => pluralize(n, 'подборка', 'подборки', 'подборок') || 'подборок'
const pluralizeSongs = (n) => pluralize(n, 'песня', 'песни', 'песен') || 'песен'
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
  color: var(--primary);
}

.error {
  color: var(--danger);
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
  background-color: var(--toggle-off);
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

/* Уточнение к тумблеру выше — отступом показано, что строка подчинённая */
.sub-toggle {
  margin-top: 0.75rem;
}

.sub-toggle.disabled {
  opacity: 0.5;
  cursor: default;
}

.setting-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.4rem;
  margin-bottom: 0;
}

.experimental-hint {
  margin-top: 0;
  margin-bottom: 0.75rem;
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Скрытый input: диалог выбора файла открывает кнопка рядом */
.backup-file-input {
  display: none;
}
</style>