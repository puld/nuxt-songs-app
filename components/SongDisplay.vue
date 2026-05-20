<template>
  <div class="song-container" :class="[fontSizeClass, { 'hide-chords': !settings.showChords }]">
    <!-- Табы вариантов (только если вариантов больше одного) -->
    <div v-if="hasMultipleVariants" class="variant-tabs">
      <button
        v-for="(label, index) in variantLabels"
        :key="index"
        @click="onTabChange(index)"
        :class="['variant-tab', { active: activeVariantIndex === index }]"
      >
        {{ label }}
      </button>
    </div>

    <div class="song-content-wrapper">
      <ul class="song-list">
        <li v-for="(item, index) in activeVariantBody" :key="index" class="song-list-item">
          <div v-if="item.type === 'verse'" class="verse">
            <span class="part-label">{{ item.n }}.</span>
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
      variants: []
    })
  },
  initialVariantIndex: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['variant-change'])

const settings = useSettingsStore()

const activeVariantIndex = ref(0)

// Body активного варианта (с обратной совместимостью)
const activeVariantBody = computed(() => {
  if (props.song.variants && props.song.variants.length > 0) {
    return props.song.variants[activeVariantIndex.value].body
  }
  // Обратная совместимость: старый формат с body
  return props.song.body || []
})

// Метка текущего активного варианта
const activeVariantLabel = computed(() => {
  if (!props.song.variants || !props.song.variants.length) return ''
  return props.song.variants[activeVariantIndex.value]?.label || ''
})

// Показывать ли табы вариантов
const hasMultipleVariants = computed(() => {
  return props.song.variants && props.song.variants.length > 1
})

// Метки табов вариантов
const variantLabels = computed(() => {
  if (!props.song.variants) return []
  return props.song.variants.map((v, i) => {
    if (v.label) return v.label
    // Генерируем кириллические метки: а, б, в, ...
    return String.fromCharCode(1072 + i)
  })
})

// Сброс активного варианта при смене песни
watch(() => props.song.number, () => {
  activeVariantIndex.value = props.initialVariantIndex || 0
})

// Реакция на изменение initialVariantIndex извне (например, при навигации)
watch(() => props.initialVariantIndex, (newIndex) => {
  if (newIndex !== activeVariantIndex.value) {
    activeVariantIndex.value = newIndex
  }
})

// Инициализация при монтировании
onMounted(() => {
  if (props.initialVariantIndex) {
    activeVariantIndex.value = props.initialVariantIndex
  }
})

const onTabChange = (index) => {
  activeVariantIndex.value = index
  emit('variant-change', index)
}

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

/* Адаптивная сетка: аналогично v-col cols="12" sm="10" md="8" lg="6"
   ВНИМАНИЕ: Брейкпоинты ширины синхронизированы с .song-title-row
   в pages/song/[number].vue — при рефакторинге менять оба места. */
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

/* Размеры шрифтов — только для .content (текст куплетов/припевов) */
.font-size-small .content {
  font-size: 15px;
  line-height: 1.5;
}

.font-size-medium .content {
  font-size: 20px;
  line-height: 1.6;
}

.font-size-large .content {
  font-size: 25px;
  line-height: 1.7;
}

/* Line-height для текста с аккордами */
.font-size-small .content-withChords {
  line-height: 2.0;
}

.font-size-medium .content-withChords {
  line-height: 2.1;
}

.font-size-large .content-withChords {
  line-height: 2.2;
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
  font-size: 1rem;
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

/* Табы вариантов */
.variant-tabs {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
  padding: 0 8px;
}

.variant-tab {
  padding: 8px 16px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  white-space: nowrap;
}

.variant-tab:hover {
  color: var(--text);
  background: var(--bg-secondary);
}

.variant-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 500;
}
</style>
