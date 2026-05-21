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
      <div class="song-sheet">
        <div v-for="(item, index) in activeVariantBody" :key="index" class="song-part" :class="item.type">
          <span class="part-label">{{ item.type === 'verse' ? item.n + '.' : 'Припев:' }}</span>
          <div
            class="content"
            :class="{ 'content-withChords': hasChords(item.content) }"
            v-html="processContent(item.content)"
          ></div>
        </div>
      </div>
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

/* «Лист песни» — единый фон, без карточек/рамок */
.song-sheet {
  padding: 0.5rem 0;
}

.song-part {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.song-part:last-child {
  margin-bottom: 0;
}

.part-label {
  flex-shrink: 0;
  width: 5.5rem;
  text-align: right;
  padding: 0 0.5rem 0 0;
  color: var(--primary);
  font-weight: 500;
  line-height: inherit;
  user-select: none;
}

.verse .part-label {
  color: var(--primary);
}

.chorus .part-label {
  color: var(--danger);
}

/* Адаптация метки припева на узких экранах */
@media (max-width: 360px) {
  .part-label {
    width: 4.5rem;
    font-size: 0.85em;
  }
}

.content {
  flex: 1;
  white-space: normal;
  position: relative;
}

/* Размеры шрифтов */
.font-size-small .content,
.font-size-small .part-label {
  font-size: 15px;
  line-height: 1.5;
}

.font-size-medium .content,
.font-size-medium .part-label {
  font-size: 20px;
  line-height: 1.6;
}

.font-size-large .content,
.font-size-large .part-label {
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
