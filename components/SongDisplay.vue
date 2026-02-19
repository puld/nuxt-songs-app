<template>
  <div class="song-container" :class="[fontSizeClass, { 'hide-chords': !settings.showChords }]">
    <div class="song-content-wrapper">
      <ul class="song-list">
        <li v-for="(item, index) in song.body" :key="index" class="song-list-item">
          <div v-if="item.type === 'verse'" class="verse">
            <span class="part-label">{{ item.id + 1 }}.</span>
            <div
              class="content"
              :class="{ 'content-withChords': hasChords(item.content) }"
              v-html="processContent(item.content)"
            ></div>
          </div>

          <div v-else-if="item.type === 'chorus'" class="chorus">
            <span class="part-label">Припев:</span>
            <div
              v-if="item.content"
              class="content"
              :class="{ 'content-withChords': hasChords(item.content) }"
              v-html="processContent(item.content)"
            ></div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

const props = defineProps({
  song: {
    type: Object,
    required: true,
    default: () => ({
      number: 0,
      title: '',
      body: []
    })
  }
})

const settings = useSettingsStore()

const fontSizeClass = computed(() => {
  return `font-size-${settings.fontSize}`
})

const processContent = (content) => {
  if (!content) return ''

  if (!settings.showChords) {
    // Удаляем аккорды в фигурных скобках
    return content.replace(/\{[^\}]*\}/g, '')
  }

  // Формат: {Am} → аккорд выше текста, {_G} → аккорд в строке
  let result = content

  // Обрабатываем инлайн аккорды {_G}
  result = result.replace(/\{_/g, "<span class='chord'>")

  // Обрабатываем аккорды над текстом {Am}
  result = result.replace(/\{/g, "<span class='chord chord-up'>")
  result = result.replace(/\}/g, "</span>")

  // Заменяем переносы строк на <br/>
  result = result.replace(/([^>])\n/g, '$1<br/>')

  return result
}

const hasChords = (str) => {
  return settings.showChords && /\{/.test(str)
}
</script>

<style scoped>
.song-container {
  width: 100%;
}

/* Адаптивная сетка: аналогично v-col cols="12" sm="10" md="8" lg="6" */
.song-content-wrapper {
  width: 100%;
  margin: 0 auto;
  padding: 0;

  /* sm: 10/12 = 83.33% */
  @media (min-width: 640px) {
    width: 83.33%;
  }

  /* md: 8/12 = 66.67% */
  @media (min-width: 768px) {
    width: 66.67%;
  }

  /* lg: 6/12 = 50% */
  @media (min-width: 1024px) {
    width: 50%;
  }
}

h2 {
  text-align: center;
  margin-bottom: 30px;
  color: var(--text);
}

/* Размеры шрифтов */
.font-size-small {
  font-size: 16px;
}

.font-size-medium {
  font-size: 24px;
}

.font-size-large {
  font-size: 32px;
}

/* Увеличенные размеры для контента */
.font-size-small .content {
  font-size: 16px;
  line-height: 1.5;
}

.font-size-medium .content {
  font-size: 24px;
  line-height: 1.6;
}

.font-size-large .content {
  font-size: 32px;
  line-height: 1.7;
}

/* Vuetify-подобный список */
.song-list {
  width: 100%;
  padding: 8px;
  list-style: none;
}

.song-list-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  padding: 0;
  margin-bottom: 20px;
}

.verse, .chorus {
  display: flex;
  align-items: flex-start;
  width: 100%;
  flex: 1;
  padding: 0;
  position: relative;
}

.part-label {
  font-weight: 400;
  padding: 12px 16px;
  color: var(--text);
  display: flex;
  align-items: center;
}

.verse .part-label {
  color: var(--primary);
}

.chorus .part-label {
  color: var(--danger);
}

.content {
  line-height: 1.5;
  white-space: normal;
  flex: 1;
  display: flex;
  padding: 12px 16px;
  background-color: var(--bg-secondary);
  border-radius: 4px;
  position: relative;
}

.content-withChords {
  line-height: 2.5;
}

/* Стили для аккордов */
.content :deep(.chord) {
  color: var(--chord-color);
  font-weight: bold;
}

.content :deep(.chord-up) {
  position: absolute;
  line-height: 0;
}

.hide-chords :deep(.chord) {
  display: none;
}
</style>