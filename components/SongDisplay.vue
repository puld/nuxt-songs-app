<template>
  <div class="song-container" :class="[fontSizeClass, { 'hide-chords': !settings.showChords }]">
    <h2>{{ song.number }}. {{ song.title }}</h2>

    <ul class="song-body">
      <li v-for="(item, index) in song.body" :key="index" class="song-part">
        <div v-if="item.type === 'verse'" class="verse">
          <span class="part-label">{{ item.id + 1 }}</span>
          <pre class="content">{{ processContent(item.content) }}</pre>
        </div>

        <div v-else-if="item.type === 'chorus'" class="chorus">
          <span class="part-label">Припев</span>
          <pre v-if="item.content" class="content">{{ processContent(item.content) }}</pre>
        </div>
      </li>
    </ul>
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
    // Удаляем аккорды в квадратных скобках
    return content.replace(/\[.*?\]/g, '')
  }
  return content
}
</script>

<style scoped>
.song-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  transition: font-size 0.3s ease;
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

/* Стили для аккордов */
.content :deep([class^="chord"]) {
  color: var(--chord-color);
  font-weight: bold;
}

.hide-chords :deep([class^="chord"]) {
  display: none;
}

h2 {
  text-align: center;
  margin-bottom: 30px;
  color: var(--primary-color);
}

.song-body {
  list-style: none;
  padding: 0;
  line-height: 1.6;
}

.song-part {
  margin-bottom: 20px;
}

.part-label {
  display: flex;
  font-weight: bold;
  color: var(--secondary-color);

  align-items: center;

  font-weight: 400;
  padding: 12px 16px;

}
.verse, .chorus {
  align-items: flex-start;
  display: flex;
  flex: 1 1 100%;
  letter-spacing: normal;
  outline: none;
  padding: 12px 16px;
  position: relative;
}

.verse .part-label {
  color: #1a73e8; /* Синий для куплетов */
}

.chorus .part-label {
  color: #e91e63; /* Розовый для припевов */
}

.content {
  white-space: pre-wrap;
  font-family: inherit;
  margin: 0;
  background-color: var(--bg-secondary);
  border-radius: 4px;

  align-items: center;
  align-self: center;
  display: flex;
  flex-wrap: wrap;
  flex: 1 1;
  overflow: hidden;
  padding: 12px 16px;
}

/* Для темной темы */
.dark .content {
  background-color: var(--dark-bg-secondary);
}
</style>