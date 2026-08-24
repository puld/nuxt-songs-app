<script setup>
import { useSettingsStore } from '~/stores/settings'
import { clampOffset, dropIndex, moveItem, previewShift, sortCollections } from '~/lib/collectionsOrder'

const colorMode = useColorMode()
const settings = useSettingsStore()

const { showNavbar, autoUpdate, showToast, onUpdateApplied } = useLayoutCommon()

// Sidebar
const sidebarOpen = ref(false)
const sidebarCollections = ref([])
const { getCollections, getSongsCountInCollection, reorderCollections } = useIndexDB()

const loadSidebarCollections = async () => {
  const collections = await getCollections()
  const withCounts = await Promise.all(
    collections.map(async (c) => ({
      ...c,
      songsCount: await getSongsCountInCollection(c.id)
    }))
  )
  sidebarCollections.value = sortCollections(withCounts)
}

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
  if (sidebarOpen.value) {
    loadSidebarCollections()
  } else {
    reordering.value = false
  }
}

const closeSidebar = () => {
  sidebarOpen.value = false
  reordering.value = false
}

// === Порядок подборок ===
// Режим перестановки отдельный, а не «тяни в любой момент»: в обычном
// состоянии строка — ссылка, и жест по ней должен открывать подборку, а не
// двигать список.
const reordering = ref(false)
const drag = ref(null)

// «Избранное» закреплено первым и не переставляется, поэтому индексы
// перетаскивания считаются от первой пользовательской подборки.
const pinnedCount = computed(() => sidebarCollections.value.filter(c => c.isFavorite).length)
const movableCount = computed(() => sidebarCollections.value.length - pinnedCount.value)
// Одну подборку переставлять некуда — кнопку не показываем вовсе.
const canReorder = computed(() => movableCount.value > 1)

const toggleReorder = () => {
  reordering.value = !reordering.value
  endDrag()
  drag.value = null
}

/**
 * Пишет новый порядок в базу, показав его сразу.
 *
 * Список уже отсортирован, поэтому ждать записи, чтобы перерисовать сайдбар,
 * незачем; если запись не удалась — возвращаем то, что в базе, иначе на экране
 * останется порядок, которого там нет.
 */
const applyOrder = async (ordered) => {
  sidebarCollections.value = ordered
  try {
    await reorderCollections(ordered.map(c => c.id))
  } catch (e) {
    await loadSidebarCollections()
  }
}

// Обмен местами по стрелке: то же движение, что при перетаскивании, только
// ведёт его не палец. Без анимации строки просто менялись местами мгновенно, и
// было не видно, какая из них куда поехала.
const swap = ref(null)

const moveBy = (index, step, event) => {
  // Пока идёт движение, новое не начинаем: порядок ещё не записан, и следующий
  // шаг считался бы от индексов, которых на экране уже нет.
  if (swap.value || drag.value) return

  const to = index + step
  if (to < pinnedCount.value || to >= sidebarCollections.value.length) return

  const rowHeight = event?.currentTarget?.closest('.sidebar-collection-row')?.offsetHeight || 0
  if (!rowHeight) {
    // Высоту строки измерить не удалось — переставляем без анимации: показать
    // результат важнее, чем показать движение.
    applyOrder(moveItem(sidebarCollections.value, index, to))
    return
  }

  swap.value = { from: index, to, rowHeight }
  setTimeout(() => {
    swap.value = null
    applyOrder(moveItem(sidebarCollections.value, index, to))
  }, SETTLE_MS)
}

/** Сколько строка доезжает до слота после отпускания ручки. */
const SETTLE_MS = 140

/**
 * Скроллируемый контейнер списка на время жеста.
 *
 * Держим его вне `drag`, а не в состоянии: это DOM-узел, реактивность ему не
 * нужна, а лишний ключ в объекте состояния копировался бы при каждом кадре.
 */
let dragList = null

/**
 * Пересчитывает смещение и целевой слот по последней позиции указателя.
 *
 * Отдельно от обработчика событий, потому что двигаться может не только палец:
 * при автоскролле указатель стоит, а список едет — и строка должна оставаться
 * там, где её держат.
 */
const updateDrag = () => {
  const state = drag.value
  if (!state || state.settling) return

  // Смещение считаем в координатах содержимого, а не окна: прокрутка списка
  // уводит строку из-под пальца ровно на `scrollTop`, и без этой поправки
  // строка «отклеивается» от курсора.
  const scrolled = dragList ? dragList.scrollTop - state.startScroll : 0
  const from = state.index - pinnedCount.value
  const offset = clampOffset(from, state.pointerY - state.startY + scrolled, state.rowHeight, movableCount.value)
  const target = dropIndex(from, offset, state.rowHeight, movableCount.value) + pinnedCount.value

  drag.value = { ...state, offset, target }
}

/** Полоса у края списка, в которой он подкручивается сам, и шаг за кадр. */
const AUTO_SCROLL_EDGE = 36
const AUTO_SCROLL_STEP = 10

let autoScrollFrame = null

const stopAutoScroll = () => {
  if (autoScrollFrame === null) return

  cancelAnimationFrame(autoScrollFrame)
  autoScrollFrame = null
}

/**
 * Подкручивает список, пока указатель держат у его края.
 *
 * Без этого подборку из конца длинного списка нельзя перенести в начало одним
 * жестом: дотащил до края — и дальше некуда, надо отпускать и прокручивать.
 */
const autoScrollTick = () => {
  autoScrollFrame = null

  const state = drag.value
  if (!state || state.settling || !dragList) return

  const box = dragList.getBoundingClientRect()
  const step = state.pointerY - box.top < AUTO_SCROLL_EDGE ? -AUTO_SCROLL_STEP
    : box.bottom - state.pointerY < AUTO_SCROLL_EDGE ? AUTO_SCROLL_STEP
      : 0
  if (!step) return

  const before = dragList.scrollTop
  dragList.scrollTop = before + step
  // Список упёрся в край — крутить кадры вхолостую незачем. Вернётся палец к
  // краю снова — следующий `pointermove` цикл и перезапустит.
  if (dragList.scrollTop === before) return

  updateDrag()
  autoScrollFrame = requestAnimationFrame(autoScrollTick)
}

const ensureAutoScroll = () => {
  if (autoScrollFrame === null) autoScrollFrame = requestAnimationFrame(autoScrollTick)
}

/**
 * Прокрутка списка во время жеста — тоже движение строки.
 *
 * Колесо и инерционный скролл не порождают `pointermove`, поэтому без этой
 * подписки строка оставалась бы там, где её положил последний сдвиг пальца, и
 * уезжала бы из-под курсора вместе с содержимым списка.
 */
const onDragScroll = () => updateDrag()

/** Снимает всё, что живёт только на время жеста. */
const endDrag = () => {
  stopAutoScroll()
  dragList?.removeEventListener('scroll', onDragScroll)
  dragList = null
}

const onHandleDown = (index, event) => {
  // Пока предыдущая строка доезжает, новый жест не начинаем: порядок ещё не
  // записан, и индексы поехали бы относительно того, что видно на экране.
  if (drag.value?.settling) return

  const row = event.currentTarget.closest('.sidebar-collection-row')
  dragList = row?.closest('.sidebar-collections') || null
  dragList?.addEventListener('scroll', onDragScroll, { passive: true })
  // Высота строки нужна, чтобы переводить смещение пальца в шаг по списку;
  // строки одинаковые, поэтому меряем одну и один раз за жест.
  drag.value = {
    index,
    target: index,
    startY: event.clientY,
    pointerY: event.clientY,
    startScroll: dragList?.scrollTop || 0,
    offset: 0,
    rowHeight: row?.offsetHeight || 0
  }
  // Захват указателя: палец уходит за пределы кнопки-ручки, а события должны
  // продолжать приходить ей — иначе перетаскивание рвётся на первом же шаге.
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

const onHandleMove = (event) => {
  if (!drag.value || drag.value.settling) return

  drag.value = { ...drag.value, pointerY: event.clientY }
  updateDrag()
  ensureAutoScroll()
}

const onHandleUp = () => {
  const state = drag.value
  endDrag()
  if (!state || state.settling) return

  if (state.target === state.index) {
    drag.value = null
    return
  }

  // Строка доезжает до слота анимацией, и только потом список переставляется.
  // Порядок нельзя применить сразу: DOM переставился бы прямо посреди
  // движения, и строка доигрывала бы уже с нового места. Соседи расступились
  // ещё во время перетаскивания и никуда не едут — им анимация не нужна.
  drag.value = { ...state, settling: true, offset: (state.target - state.index) * state.rowHeight }

  setTimeout(() => {
    drag.value = null
    // Смещения снимаются одновременно с перестановкой, поэтому на экране
    // ничего не сдвигается: строки уже стоят там, куда встают по порядку.
    applyOrder(moveItem(sidebarCollections.value, state.index, state.target))
  }, SETTLE_MS)
}

/**
 * Сдвиг строки во время перетаскивания: перетаскиваемая идёт за пальцем,
 * соседи расступаются — иначе непонятно, куда встанет подборка.
 */
const rowStyle = (index) => {
  const state = drag.value
  if (!state) return {}
  if (index === state.index) {
    return {
      transform: `translateY(${state.offset}px)`,
      // Переход только на оседании: под пальцем строка должна идти без
      // задержки, иначе она от него отстаёт
      transition: state.settling ? `transform ${SETTLE_MS}ms ease-out` : 'none'
    }
  }

  // Сосед расступается плавно — тем же движением, что и обмен по стрелке.
  // Переход задаётся здесь, а не в CSS: как только перетаскивание кончается,
  // стиль пропадает вместе с ним, и снятие смещений происходит мгновенно —
  // в этот момент список уже переставлен, и анимировать возврат к нулю
  // означало бы гнать строки от их новых мест к тем же местам.
  const shift = previewShift(index, state.index, state.target)
  return {
    transform: `translateY(${shift * state.rowHeight}px)`,
    transition: `transform ${SETTLE_MS}ms ease-out`
  }
}

/** Сдвиг двух строк, меняющихся местами по стрелке. */
const swapStyle = (index) => {
  const state = swap.value
  if (!state) return {}

  const rows = index === state.from ? state.to - state.from
    : index === state.to ? state.from - state.to
      : 0

  return rows
    ? { transform: `translateY(${rows * state.rowHeight}px)`, transition: `transform ${SETTLE_MS}ms ease-out` }
    : {}
}

// Provide для компонентов NavBarHamburger / NavBarBack
provide('toggleSidebar', toggleSidebar)
provide('updateAvailable', autoUpdate.updateAvailable)
</script>

<template>
  <Head>
    <meta name="theme-color" content="#ffffff">
  </Head>
  <div class="layout" :class="colorMode.value">
    <!-- Overlay -->
    <Transition name="fade">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>
    </Transition>

    <!-- Sidebar -->
    <Transition name="slide">
      <aside v-if="sidebarOpen" class="sidebar">
        <div class="sidebar-header">
          <button class="sidebar-close-btn" @click="closeSidebar">
            <Icon name="mingcute:close-line" size="1.5rem"/>
          </button>
          <span class="sidebar-title">Меню</span>
        </div>
        <nav class="sidebar-nav">
          <NuxtLink to="/" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:home-5-line" size="1.25rem"/>
            <span>Главная</span>
          </NuxtLink>

          <NuxtLink v-if="settings.devMode" to="/songs" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:list-check-line" size="1.25rem"/>
            <span>Все песни</span>
          </NuxtLink>

          <div class="sidebar-divider"></div>

          <div class="sidebar-section-header">
            <span>Подборки</span>
            <button
              v-if="settings.devMode && canReorder"
              type="button"
              class="sidebar-reorder-btn"
              data-testid="reorder-toggle"
              @click="toggleReorder"
            >
              {{ reordering ? 'Готово' : 'Порядок' }}
            </button>
          </div>

          <div class="sidebar-collections" :class="{ 'is-reordering': reordering }">
            <div
              v-for="(collection, index) in sidebarCollections"
              :key="collection.id"
              class="sidebar-collection-row"
              :class="{ 'is-lifted': (drag && drag.index === index) || (swap && swap.from === index) }"
              :style="[rowStyle(index), swapStyle(index)]"
              data-testid="sidebar-collection"
            >
              <!-- Ручка перетаскивания. touch-action: none — иначе жест
                   вниз браузер отдаёт прокрутке списка, а не нам. -->
              <button
                v-if="reordering && !collection.isFavorite"
                type="button"
                class="collection-handle"
                data-testid="collection-handle"
                aria-label="Перетащить подборку"
                @pointerdown="onHandleDown(index, $event)"
                @pointermove="onHandleMove"
                @pointerup="onHandleUp"
                @pointercancel="onHandleUp"
              >
                <Icon name="mingcute:menu-line" size="1.1rem" />
              </button>
              <!-- Место ручки у «Избранного»: она закреплена первой, но имена
                   подборок должны стоять в одну колонку. -->
              <span v-else-if="reordering" class="collection-handle-placeholder"></span>

              <NuxtLink
                :to="`/collections/${collection.id}`"
                class="sidebar-link sidebar-collection-link"
                :class="{ 'is-locked': reordering }"
                @click="closeSidebar"
              >
                <Icon
                  :name="collection.isFavorite ? 'mingcute:star-fill' : 'mingcute:folder-line'"
                  :class="{ 'favorite-icon': collection.isFavorite }"
                  size="1.25rem"
                />
                <span class="sidebar-collection-name">{{ collection.name }}</span>
                <span v-if="!reordering" class="sidebar-collection-count">{{ collection.songsCount }}</span>
              </NuxtLink>

              <!-- Кнопки — надёжный путь: перетаскивание пальцем по короткой
                   строке легко срывается, а тап по стрелке — нет. -->
              <span v-if="reordering && !collection.isFavorite" class="collection-move">
                <button
                  type="button"
                  class="collection-move-btn"
                  data-testid="collection-up"
                  aria-label="Выше"
                  :disabled="index <= pinnedCount"
                  @click="moveBy(index, -1, $event)"
                >
                  <Icon name="mingcute:up-line" size="1.1rem" />
                </button>
                <button
                  type="button"
                  class="collection-move-btn"
                  data-testid="collection-down"
                  aria-label="Ниже"
                  :disabled="index >= sidebarCollections.length - 1"
                  @click="moveBy(index, 1, $event)"
                >
                  <Icon name="mingcute:down-line" size="1.1rem" />
                </button>
              </span>
            </div>
          </div>

        </nav>

        <div class="sidebar-bottom">
          <NuxtLink to="/about" class="sidebar-link" @click="closeSidebar">
            <Icon name="mingcute:information-line" size="1.25rem"/>
            <span>О приложении</span>
          </NuxtLink>
          <NuxtLink to="/settings" class="sidebar-link" @click="closeSidebar">
            <span class="sidebar-link-icon-wrap">
              <Icon name="mingcute:settings-3-line" size="1.25rem"/>
              <span v-if="autoUpdate.updateAvailable.value" class="update-badge"></span>
            </span>
            <span>Настройки</span>
          </NuxtLink>
        </div>
      </aside>
    </Transition>

    <!-- Navigation Bar -->
    <nav class="app-bar" :class="{ 'app-bar-hidden': !showNavbar }">
      <div id="navbar-left"></div>
      <div id="navbar-center"></div>
      <div id="navbar-right"></div>
    </nav>

    <div class="page-content">
      <slot/>
    </div>

    <UpdateToast v-model="showToast" @applied="onUpdateApplied"/>
    <ClientOnly>
      <RestoreBackupToast/>
    </ClientOnly>
  </div>
</template>

<style>
.layout {
  /* svh, а не dvh/vh/100%: это высота вьюпорта при ПОКАЗАННОМ системном UI —
     наименьшая из возможных. В PWA на Android системная навигация скрыта и
     вызывается свайпом снизу; окно при этом уменьшается, а vh/проценты (и,
     как выяснилось на устройстве, dvh тоже) остаются от прежнего размера —
     на короткой странице появлялся скролл ровно на высоту навигации.
     svh не зависит от её состояния, поэтому переполнения не даёт: при
     скрытой навигации внизу остаётся полоса, закрашенная фоном body.
     Фолбэк на vh намеренно не задан — он и есть источник бага. */
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  transition: background 0.3s, color 0.3s;
}

/* Sidebar overlay */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 300px;
  background: var(--bg);
  border-right: 1px solid var(--border-color);
  z-index: 300;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  height: 56px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-weight: bold;
  font-size: 1.1rem;
}

.sidebar-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  flex-shrink: 0;
  transition: background 0.2s;
}

.sidebar-close-btn:hover {
  background: var(--bg-secondary);
}

.sidebar-nav {
  padding: 0.5rem 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1.25rem;
  color: var(--text);
  text-decoration: none;
  transition: background 0.2s;
}

.sidebar-link:hover {
  background: var(--bg-secondary);
}

.sidebar-divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.25rem 1rem;
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

/* Кнопка-ссылка: рядом с заголовком секции полноценная кнопка выглядела бы
   тяжелее самих подборок */
.sidebar-reorder-btn {
  background: none;
  border: none;
  padding: 0.1rem 0.25rem;
  font: inherit;
  letter-spacing: inherit;
  color: var(--primary);
  cursor: pointer;
}

.sidebar-collections {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.sidebar-collection-link {
  padding: 0.75rem 1.25rem;
  flex: 1;
  min-width: 0;
}

/* Строка — контейнер: ручка и стрелки не могут лежать внутри ссылки (кнопка
   внутри <a> — невалидная разметка), поэтому ссылкой остаётся только имя */
.sidebar-collection-row {
  display: flex;
  align-items: center;
  background: var(--bg);
  /* Перехода по transform здесь сознательно нет: в момент отпускания список
     уже переставлен, а недоигранная анимация тянула прежние смещения к нулю —
     строки заметно «догоняли» свои новые места. Мгновенное превью к тому же
     точнее следует за пальцем. */
}

/* Строка, которая двигается — под пальцем или по стрелке: она идёт поверх той,
   которую заменяет, иначе непонятно, какая из двух куда поехала */
.sidebar-collection-row.is-lifted {
  position: relative;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* В режиме перестановки ссылка не должна перехватывать жест: тап по имени
   открыл бы подборку прямо посреди сортировки */
.sidebar-collection-link.is-locked {
  pointer-events: none;
}

.collection-handle,
.collection-move-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2.25rem;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.collection-handle {
  margin-left: 0.5rem;
  cursor: grab;
  /* Жест по ручке — только перетаскивание: без этого браузер отдаёт движение
     вниз прокрутке списка подборок */
  touch-action: none;
}

.collection-handle-placeholder {
  width: 2rem;
  margin-left: 0.5rem;
  flex-shrink: 0;
}

.collection-move {
  display: flex;
  flex-shrink: 0;
  padding-right: 0.5rem;
}

.collection-move-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.sidebar-collection-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-collection-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.favorite-icon {
  color: var(--star-color);
}

.sidebar-bottom {
  border-top: 1px solid var(--border-color);
  padding: 0.25rem 0;
}

.sidebar-link-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.update-badge {
  position: absolute;
  top: -3px;
  right: -5px;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
}

/* Transition: sidebar slide */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

/* Transition: overlay fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Navigation Bar */
.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 1rem;
  z-index: 100;
  transition: transform 0.3s ease-in-out;
}

.app-bar-hidden {
  transform: translateY(-100%);
}

#navbar-left {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

#navbar-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

#navbar-right {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.25rem;

  /* Синхронизация с шириной контента песни (song-title-row, song-content-wrapper)
     ВНИМАНИЕ: Брейкпоинты ширины синхронизированы с .song-content-wrapper
     в components/SongDisplay.vue — при рефакторинге менять оба места. */
  @media (min-width: 480px) {
    right: calc((100% - 90%) / 2);
  }

  @media (min-width: 640px) {
    right: calc((100% - 83.33%) / 2);
  }

  @media (min-width: 768px) {
    right: calc((100% - 66.67%) / 2);
  }

  @media (min-width: 1024px) {
    right: calc((100% - 50%) / 2);
  }
}

/* Средний/крупный шрифт: уже колонка на xs (синхронно с SongDisplay) */
@media (min-width: 480px) {
  .font-size-medium #navbar-right {
    right: calc((100% - 85%) / 2);
  }

  .font-size-large #navbar-right {
    right: calc((100% - 95%) / 2);
  }
}

@media (min-width: 640px) {
  .font-size-medium #navbar-right {
    right: calc((100% - 83.33%) / 2);
  }

  .font-size-large #navbar-right {
    right: calc((100% - 95%) / 2);
  }
}

@media (min-width: 768px) {
  .font-size-large #navbar-right {
    right: calc((100% - 66.67%) / 2);
  }
}

/* Средний/крупный шрифт на десктопе: учитываем max-width колонки через max() */
@media (min-width: 1024px) {
  .font-size-medium #navbar-right {
    right: max(calc((100% - 50%) / 2), calc((100% - 40rem) / 2));
  }

  .font-size-large #navbar-right {
    right: max(calc((100% - 50%) / 2), calc((100% - 35rem) / 2));
  }
}

.page-content {
  padding-top: calc(56px + 1rem);
  flex: 1;
  padding-left: 1rem;
  padding-right: 1rem;
  padding-bottom: 1rem;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: var(--bg-secondary);
}

.nav-btn-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-title {
  font-weight: bold;
  font-size: 1.25rem;
  color: var(--text);
  white-space: nowrap;
}
</style>
