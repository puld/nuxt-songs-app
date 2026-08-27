<template>
  <div class="song-container" :class="[fontSizeClass, { 'hide-chords': !settings.chordsVisible }]">
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
      <div ref="sheet" class="song-sheet">
        <div
          v-for="(item, index) in activeVariantBody"
          :key="index"
          class="song-part"
          :class="[item.type, { 'with-chords': hasChords(item.content) }]"
        >
          <template v-if="item.type === 'verse'">
            <span class="part-label">{{ item.n }}.</span>
            <div class="content" v-html="processContent(item.content)"></div>
          </template>
          <template v-else>
            <span class="part-label chorus-label">Припев:</span>
            <div class="content" v-html="processContent(item.content)"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { processRepeats } from '~/lib/repeats'
import { renderChords, hasChords as textHasChords } from '~/lib/chordMarkup'
import { planChordShifts } from '~/lib/chordLayout'
import { transposeText, stripBassText, preferSharp, normalizeTranspose } from '~/lib/transpose'

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
  },
  /**
   * Сдвиг тональности в полутонах. Применяется при отрисовке: в базе текст
   * лежит в исходной тональности, и сдвиг её не портит.
   */
  transpose: {
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

/**
 * Писать ли аккорды диезами — решает целевая тональность, поэтому набор знаков
 * считается один раз по всему варианту: иначе один куплет получил бы `Bb`,
 * а соседний `A#`.
 */
const sharpSpelling = computed(() => {
  const shift = normalizeTranspose(props.transpose)
  if (!shift) return false
  const text = (activeVariantBody.value || []).map((item) => item.content || '').join('\n')
  return preferSharp(text, shift)
})

const processContent = (content) => {
  if (!content) return ''

  // 0. Сдвиг тональности — до всего остального: он меняет только содержимое {…}
  let result = transposeText(content, normalizeTranspose(props.transpose), sharpSpelling.value)

  // 0.5. Упрощение аккордов — тоже по разметке {…}, до её разбора в разметку HTML.
  // Обращения (`G/B`) нужны аккомпаниатору, а поющему только мешают читать
  if (settings.chordBassHidden) result = stripBassText(result)

  // 1. Обрабатываем повторы (/текст /Nр.) — не затрагивает аккорды {Am}
  result = processRepeats(result)

  // 2. Аккорды: {Am} над строкой, {_G} в строке
  result = renderChords(result, settings.chordsVisible)

  // Ремарки-инструкции [текст] — показываются всегда, курсивом
  result = result.replace(/\[([^\]]*)\]/g, "<span class='stage-direction'>$1</span>")

  // Заменяем переносы строк на <br/>
  result = result.replace(/\n/g, '<br/>')

  return result
}

const hasChords = (str) => {
  return settings.chordsVisible && textHasChords(str)
}

/** Подъём надписи над своей строкой — то же значение, что в CSS у `.chord-label`. */
const CHORD_RISE = '-0.2rem'

const sheet = ref(null)

/**
 * Раскладка надписей аккордов: измерить, посчитать сдвиги, записать в стиль.
 *
 * Считается строфа целиком, а не строка: где именно текст переносится, заранее
 * неизвестно — это зависит от ширины экрана и размера шрифта. Строки различает
 * сама раскладка, по вертикали измеренных надписей.
 */
const layoutChords = () => {
  const root = sheet.value
  if (!root) return

  for (const block of root.querySelectorAll('.content')) {
    const labels = Array.from(block.querySelectorAll('.chord-label'))
    if (!labels.length) continue

    // Прежние сдвиги снимаются до замера: иначе повторная раскладка считала бы
    // позиции от уже сдвинутых надписей и уводила их всё дальше от своих слогов
    for (const el of labels) el.style.transform = ''

    const box = block.getBoundingClientRect()
    const boxes = labels.map((el) => {
      const rect = el.getBoundingClientRect()
      return { top: rect.top, left: rect.left, width: rect.width }
    })

    const shifts = planChordShifts(boxes, { minLeft: box.left, maxRight: box.right })
    shifts.forEach((shift, i) => {
      labels[i].style.transform = `translate(${shift}px, ${CHORD_RISE})`
    })
  }
}

/** Пересчёт после того, как Vue обновит DOM. */
const scheduleLayout = () => nextTick(layoutChords)

let resizeObserver = null

onMounted(() => {
  scheduleLayout()

  // Пока не загрузился шрифт, ширины меряются по подставленному системному —
  // и раскладка получилась бы не от того шрифта, который увидит читатель
  document.fonts?.ready?.then(layoutChords)

  if (typeof ResizeObserver !== 'undefined') {
    // Переносы строк зависят от ширины колонки: поворот экрана и изменение окна
    // требуют пересчёта, хотя сама разметка не менялась
    resizeObserver = new ResizeObserver(layoutChords)
    resizeObserver.observe(sheet.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// Текст, размер шрифта и сама настройка меняют и разметку, и переносы
watch([
  activeVariantBody,
  () => settings.fontSize,
  () => settings.chordsVisible,
  // Упрощение меняет ширину надписей («D7/F#» вдвое шире «D7»), а от неё
  // зависит, какие из них расходятся
  () => settings.chordBassHidden,
  () => props.transpose
], scheduleLayout)

</script>

<style scoped>
.song-container {
  width: 100%;
  /* Интервал строк — одна переменная на номер куплета и на текст: они стоят в
     соседних ячейках грида, и разный интервал разводит их первые строки */
  --line-normal: 1.7;
  --line-chords: 2.6;
  --line: var(--line-normal);
}

/* С аккордами строки разводятся сильнее обычного: надпись встаёт в воздух между
   строк, а не липнет к тексту сверху. Интервал меняется у всей части, а не у
   одного текста — иначе номер куплета со своим интервалом 1.7 оказывался выше
   первой строки, к которой он относится */
.song-part.with-chords {
  --line: var(--line-chords);
}

/* Адаптивная ширина: width: 100% с max-width гарантирует линейный
   рост ширины до максимума, без скачков на брейкпоинтах.
   ВНИМАНИЕ: max-width синхронизированы с .song-title-row
   в pages/song/[number].vue — при рефакторинге менять оба места. */
.song-content-wrapper {
  width: 100%;
  max-width: 45rem;
  margin: 0 auto;
  padding: 0;
}

.font-size-medium .song-content-wrapper {
  max-width: 40rem;
}

.font-size-large .song-content-wrapper {
  max-width: 35rem;
}

/* «Лист песни» — CSS переменные для колонок
   --label-col фиксирована по размеру шрифта, чтобы «Припев:»
   в inline режиме не расширял колонку и не сдвигал текст.
   width: fit-content сжимает лист до самой широкой строки,
   margin-inline: auto центрирует его — короткие строки песен
   больше не прижаты к левому краю wrapper'а. */
.song-sheet {
  --label-col: 1.5rem;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
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
  margin-bottom: 2rem;
}

/* Размеры шрифтов */
.font-size-small .song-part{
  column-gap: 0.5rem;
  margin-bottom: 2rem;
}

.font-size-medium .song-part{
  column-gap: 0.667rem;
  margin-bottom: 2.667rem;
}

.font-size-large .song-part{
  column-gap: 0.833rem;
  margin-bottom: 3.333rem;
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
  user-select: none;
}

.chorus .content {
  grid-column: 2;
  grid-row: 2;
}

/* На широких экранах номера куплетов равняются по правому краю — к колонке текста */
@media (min-width: 480px) {
  .verse .part-label {
    text-align: right;
  }
}

/*
 * «Припев:» встаёт в строку с текстом только когда для него есть место.
 *
 * Подпись выведена из потока и висит в поле слева от листа: колонка под неё не
 * расширяется, иначе текст всех куплетов сдвинулся бы ради одного слова. Поле
 * это — половина того, что осталось от окна за вычетом листа, поэтому inline-режим
 * можно включать не раньше, чем окно станет шире листа на двойной вылет подписи:
 *
 *     порог = max-width листа + 2 × (ширина «Припев:» − var(--label-col))
 *
 * По замерам: small — 720 + 2×32 ≈ 808, medium — 640 + 2×43 ≈ 750,
 * large — 560 + 2×54 ≈ 692. Отсюда 768px для среднего и крупного и 800px для
 * мелкого: у него лист самый широкий, а поля остаются самыми узкими.
 *
 * До порога подпись стоит отдельной строкой над текстом. Это не запасной вариант
 * на всякий случай: раньше средний шрифт включал inline уже с 480px, и на экране
 * шириной 482px «Припев:» уезжал за левый край окна — ровно то, ради чего
 * крупному шрифту когда-то и подняли порог до 768px.
 */
@media (min-width: 768px) {
  .font-size-medium .chorus,
  .font-size-large .chorus {
    position: relative;
  }

  .font-size-medium .chorus-label,
  .font-size-large .chorus-label {
    position: absolute;
    right: calc(100% - var(--label-col));
    top: 0;
    width: max-content;
    white-space: nowrap;
    text-align: right;
  }

  .font-size-medium .chorus .content,
  .font-size-large .chorus .content {
    grid-row: 1;
  }
}

@media (min-width: 800px) {
  .font-size-small .chorus {
    position: relative;
  }

  .font-size-small .chorus-label {
    position: absolute;
    right: calc(100% - var(--label-col));
    top: 0;
    width: max-content;
    white-space: nowrap;
    text-align: right;
  }

  .font-size-small .chorus .content {
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
  line-height: var(--line);
}

.font-size-medium .content,
.font-size-medium .part-label {
  font-size: 20px;
  line-height: var(--line);
}

.font-size-large .content,
.font-size-large .part-label {
  font-size: 25px;
  line-height: var(--line);
}

/* Интервал у «Припев:» зависит от того, где он стоит, поэтому собран здесь, а не
   в правилах позиционирования: те идут до размеров шрифта и были бы перебиты.
   В строке с текстом интервал общий с ней, отдельной строкой над текстом —
   обычный: разведённый только оторвал бы подпись от своего припева.
   Пороги те же, что у inline-режима выше, — иначе интервал разъедется с ним */
.song-part .chorus-label {
  line-height: var(--line-normal);
}

@media (min-width: 768px) {
  .font-size-medium .song-part .chorus-label,
  .font-size-large .song-part .chorus-label {
    line-height: var(--line);
  }
}

@media (min-width: 800px) {
  .font-size-small .song-part .chorus-label {
    line-height: var(--line);
  }
}

/* Стили для аккордов */
.content :deep(.chord) {
  color: var(--chord-color);
  font-weight: bold;
}

/* Надпись аккорда выведена из потока, поэтому текст верстается ровно так же, как
   без аккордов: слова не раздвигаются, переносы не смещаются. Без `left`/`top`
   абсолютный элемент встаёт на своё место в строке (static position) — то есть
   перед своим слогом; горизонтальный сдвиг от наложения досчитывает
   `lib/chordLayout.js` и записывает в `transform` */
.content :deep(.chord-label) {
  position: absolute;
  /* Своё место надписи — верхняя граница строки, то есть она и так стоит чуть
     ниже середины промежутка между строками. Аккорд относится к строке под ним,
     поэтому от точной середины его сдвигают вниз, а подъём остаётся визуальной
     поправкой на em-высоту самой надписи. То же значение — в CHORD_RISE */
  transform: translateY(-0.2rem);
  /* Свой line-height: иначе надпись унаследовала бы разведённый интервал строки
     с аккордами и села бы заметно ниже */
  line-height: 1;
  color: var(--chord-color);
  /* мельче и легче текста: аккорд — подсказка над словом, а не вторая строка
     вровень с ним */
  font-size: 0.75em;
  font-style: italic;
  font-weight: 500;
  white-space: nowrap;
  /* В выделение и копирование текста песни надпись попадать не должна */
  user-select: none;
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

.content :deep(.stage-direction) {
  font-style: italic;
  color: var(--text-secondary);
  font-size: 0.9em;
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
