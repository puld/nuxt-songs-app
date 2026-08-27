<template>
  <div
    v-if="hasChords && settings.chordsVisible"
    class="chord-bar"
    role="group"
    aria-label="Тональность"
  >
    <div class="chord-pill">
      <button
        type="button"
        class="chord-btn"
        :disabled="transpose <= TRANSPOSE_MIN"
        aria-label="Тоном ниже"
        @click="emit('step', -1)"
      >
        −
      </button>

      <span class="chord-key">
        <Icon name="mingcute:music-2-line" size="0.9rem" class="chord-key-icon" />
        <span class="chord-key-name">{{ keyName || '—' }}</span>
        <span class="chord-key-shift">{{ transpose ? formatTranspose(transpose) : '' }}</span>
      </span>

      <button
        type="button"
        class="chord-btn"
        :disabled="transpose >= TRANSPOSE_MAX"
        aria-label="Тоном выше"
        @click="emit('step', 1)"
      >
        +
      </button>
    </div>

    <button
      type="button"
      class="chord-reset"
      :class="{ hidden: !transpose }"
      :disabled="!transpose"
      :tabindex="transpose ? undefined : -1"
      :aria-hidden="transpose ? undefined : 'true'"
      aria-label="Исходная тональность"
      @click="emit('reset')"
    >
      <Icon name="mingcute:refresh-1-line" size="1rem" />
    </button>
  </div>
</template>

<script setup>
/**
 * Подбор тональности на странице песни — строка под названием, над текстом.
 *
 * Тональность подбирают **один раз**: удобная песню переживает, и держать
 * управление под большим пальцем незачем. Зато случайное нажатие на «сброс»
 * стоит дорого — подобранное теряется молча, — поэтому кнопки убраны из-под
 * руки в шапку песни, а сброс отделён от кнопок шага заметным зазором.
 *
 * Показом аккордов управляет **только** тумблер в настройках — второй
 * переключатель здесь означал бы две точки управления одним значением.
 * Блока нет, когда аккорды выключены или их в песне нет: подбирать нечего.
 *
 * Гейт `devMode` стоит на стороне страницы, а не здесь: компонент отвечает за
 * одно — управление, и незачем дублировать условие показа в двух местах.
 */
import { useSettingsStore } from '~/stores/settings'
import { formatTranspose, TRANSPOSE_MIN, TRANSPOSE_MAX } from '~/lib/transpose'

defineProps({
  /** Сдвиг в полутонах. */
  transpose: { type: Number, default: 0 },
  /** Название тональности с учётом сдвига — считает `lib/transpose.js`. */
  keyName: { type: String, default: '' },
  /** Есть ли в песне размеченные аккорды. */
  hasChords: { type: Boolean, default: false }
})

// Наружу уходит намерение («полутоном выше»), а не готовое значение: считать
// новое значение здесь означало бы считать его от `props`, которые обновляются
// лишь к следующему рендеру — два быстрых тапа по «+» давали один шаг
const emit = defineEmits(['step', 'reset'])

const settings = useSettingsStore()
</script>

<style scoped>
/**
 * Оформление то же, что у ссылки на раздел сборника строкой выше: плашка
 * `--bg-secondary` по содержимому и по центру. Шапка песни так остаётся одним
 * блоком метаданных, а не набором разнородных панелей.
 *
 * Ничто в панели не меняет размер и не появляется на ходу: ячейка тональности
 * фиксирована по ширине, «сброс» при нулевом сдвиге держит своё место. Иначе
 * кнопка уезжает из-под пальца, и второй тап попадает в соседнюю.
 */
.chord-bar {
  display: flex;
  align-items: center;
  /* Зазор до «сброса» — не для красоты: промах по нему теряет подобранное */
  gap: 0.75rem;
  width: fit-content;
  margin: 0.5rem auto 0;
}

/* Распорка под ширину «сброса»: место под него занято всегда, и без пары
   слева пилюля стояла бы левее середины колонки — рядом со строкой раздела,
   которая по центру, это заметно */
.chord-bar::before {
  content: '';
  width: 2rem;
}

.chord-pill {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.chord-btn {
  /* Полутон подбирают подряд, и промахиваться по мелкой кнопке дороже всего */
  min-width: 2.5rem;
  padding: 0.35rem 0;
  border: none;
  background: none;
  color: var(--text);
  font-size: 1.125rem;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s;
}

.chord-btn:hover:not(:disabled) {
  background: var(--border-color);
}

.chord-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* Ширина фиксирована: «F#m» с пометкой сдвига шире «Am», и кнопки шага
   разъезжались бы на каждом полутоне */
.chord-key {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-width: 6rem;
  padding: 0 0.5rem;
  border-inline: 1px solid var(--border-color);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
}

.chord-key-icon {
  color: var(--text-secondary);
}

/* Место под пометку занято всегда — пустая она или нет */
.chord-key-shift {
  min-width: 1.25rem;
  color: var(--chord-color);
  font-size: 0.75rem;
  font-weight: 500;
}

.chord-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}

.chord-reset:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.chord-reset.hidden {
  visibility: hidden;
}
</style>
