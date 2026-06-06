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
          <template v-if="item.type === 'verse'">
            <span class="part-label">{{ item.n }}.</span>
            <div
              class="content"
              :class="{ 'content-withChords': hasChords(item.content) }"
              v-html="processContent(item.content)"
            ></div>
          </template>
          <template v-else>
            <span class="part-label chorus-label">Припев:</span>
            <div
              class="content"
              :class="{ 'content-withChords': hasChords(item.content) }"
              v-html="processContent(item.content)"
            ></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { processRepeats } from '~/lib/repeats'

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

  // 1. Обрабатываем повторы (/текст /Nр.) — не затрагивает аккорды {Am}
  let result = processRepeats(content)

  if (!settings.showChords) {
    // Удаляем аккорды в фигурных скобках (в уже обработанном HTML)
    result = result.replace(/\{[^\}]*\}/g, '')
  } else {
    // Формат: {Am} → аккорд выше текста, {_G} → аккорд в строке
    result = result.replace(/\{_/g, "<span class='chord'>")
    result = result.replace(/\{/g, "<span class='chord chord-up'>")
    result = result.replace(/\}/g, "</span>")
  }

  // Заменяем переносы строк на <br/>
  result = result.replace(/\n/g, '<br/>')

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

  /* xs: сужаем чтобы «Припев:» не выходил за экран */
  @media (min-width: 480px) {
    width: 90%;
  }

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

/* Средний шрифт: чуть уже на xs, чтобы «Припев:» не выходил за экран */
@media (min-width: 480px) {
  .font-size-medium .song-content-wrapper {
    width: 85%;
  }
}

@media (min-width: 640px) {
  .font-size-medium .song-content-wrapper {
    width: 83.33%;
  }
}

/* Крупный шрифт на xs: «Припев:» в режиме «строка сверху», колонка шире */
@media (min-width: 480px) {
  .font-size-large .song-content-wrapper {
    width: 95%;
  }
}

@media (min-width: 640px) {
  .font-size-large .song-content-wrapper {
    width: 95%;
  }
}

/* Крупный шрифт: inline «Припев:» с 768px, стандартная ширина */
@media (min-width: 768px) {
  .font-size-large .song-content-wrapper {
    width: 66.67%;
  }
}

/* Средний/крупный шрифт: ограничение ширины на широких десктопах */
@media (min-width: 1024px) {
  .font-size-small .song-content-wrapper {
    max-width: 45rem;
  }

  .font-size-medium .song-content-wrapper {
    max-width: 40rem;
  }

  .font-size-large .song-content-wrapper {
    max-width: 35rem;
  }
}

/* «Лист песни» — CSS переменные для колонок
   --label-col фиксирована по размеру шрифта, чтобы «Припев:»
   в inline режиме не расширял колонку и не сдвигал текст */
.song-sheet {
  --label-col: 1.5rem;
}

.font-size-medium .song-sheet {
  --label-col: 2rem;
}

.font-size-large .song-sheet {
  --label-col: 2.5rem;
}

/* Каждая часть — свой grid с едиными колонками */
.song-part {
  display: grid;
  grid-template-columns: var(--label-col) 1fr;
  column-gap: 0.5rem;
  margin-bottom: 1rem;
}

.song-part:last-child {
  margin-bottom: 0;
}

/* Номер куплета — в левой колонке, по левому краю */
.verse .part-label {
  grid-column: 1;
  text-align: left;
  color: var(--primary);
  font-weight: 500;
  line-height: inherit;
  user-select: none;
}

.verse .content {
  grid-column: 2;
}

/* Припев: лейбл в колонке 1, по левому краю (как номера куплетов) */
.chorus-label {
  grid-column: 1;
  grid-row: 1;
  text-align: left;
  color: var(--danger);
  font-weight: 500;
  line-height: inherit;
  user-select: none;
}

.chorus .content {
  grid-column: 2;
  grid-row: 2;
}

/* На широких экранах: номера и «Припев:» по правому краю */
@media (min-width: 480px) {
  .verse .part-label {
    text-align: right;
  }

  .chorus {
    position: relative;
  }

  .chorus-label {
    position: absolute;
    right: calc(100% - var(--label-col));
    top: 0;
    width: max-content;
    white-space: nowrap;
    text-align: right;
  }

  .chorus .content {
    grid-row: 1;
  }
}

/* Крупный шрифт: «Припев:» в режиме «строка выше» до 768px,
   т.к. при inline-позиционировании он выступает за экран */
@media (min-width: 480px) {
  .font-size-large .verse .part-label {
    text-align: left;
  }

  .font-size-large .chorus {
    position: static;
  }

  .font-size-large .chorus-label {
    position: static;
    width: auto;
    white-space: normal;
    text-align: left;
  }

  .font-size-large .chorus .content {
    grid-row: 2;
  }
}

/* Крупный шрифт: inline «Припев:» с 768px (отступ достаточен) */
@media (min-width: 768px) {
  .font-size-large .verse .part-label {
    text-align: right;
  }

  .font-size-large .chorus {
    position: relative;
  }

  .font-size-large .chorus-label {
    position: absolute;
    right: calc(100% - var(--label-col));
    top: 0;
    width: max-content;
    white-space: nowrap;
    text-align: right;
  }

  .font-size-large .chorus .content {
    grid-row: 1;
  }
}

.content {
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

/* Маркеры повторов */
.content :deep(.repeat) {
  font-style: italic;
  color: var(--text-secondary);
}

.content :deep(.repeat-depth-1) {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.9;
}

.content :deep(.repeat-depth-2) {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.8;
}

.content :deep(.repeat-depth-3) {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.7;
}

.content :deep(.repeat-marker) {
  color: var(--text-secondary);
  font-style: normal;
  font-size: 0.85em;
  user-select: none;
  opacity: 0.7;
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
