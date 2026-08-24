<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">О приложении</span>
    </Teleport>
  </ClientOnly>

  <div class="about">
    <p class="about-lead">Оффлайн сборник текстов песен. Работает без интернета: песни хранятся в браузере.</p>

    <section class="about-section">
      <h2>Как пользоваться</h2>
      <dl class="guide">
        <div v-for="item in guide" :key="item.title" class="guide-item">
          <dt class="guide-title">
            <Icon :name="item.icon" size="1.1rem" class="guide-icon" />
            <span>{{ item.title }}</span>
          </dt>
          <dd class="guide-text">{{ item.text }}</dd>
        </div>
      </dl>
    </section>

    <section class="about-section" data-testid="diagnostics-section">
      <h2>Состояние хранилища</h2>

      <!-- Ошибка базы показывается всем и всегда: без неё «данные пропали»
           выглядит как поломка приложения, а причина видна только в консоли. -->
      <p v-if="dbError" class="diagnostics-error" data-testid="diagnostics-error">
        <Icon name="mingcute:alert-line" size="1rem" />
        <span>База данных недоступна: {{ dbError }}</span>
      </p>

      <dl class="diagnostics">
        <div v-for="row in visibleDiagnostics" :key="row.label" class="diagnostics-row" data-testid="diagnostics-row">
          <dt class="diagnostics-label">{{ row.label }}</dt>
          <dd class="diagnostics-value">{{ row.value }}</dd>
        </div>
      </dl>

      <p class="diagnostics-hint">
        «Постоянное хранилище» — обещание браузера не удалять данные при нехватке места.
        Если стоит «нет», подборки стоит время от времени сохранять в файл в настройках.
      </p>
    </section>

    <div class="version-block">
      <!-- Тап по версии — активация режима разработчика (7 нажатий).
           Обычному пользователю это просто строка с версией. -->
      <button
        type="button"
        class="version-btn"
        :aria-label="`Версия приложения ${appConfig.appVersion}`"
        @click="onVersionTap"
      >
        <span class="version-row">
          <span class="version-label">Версия</span>
          <span class="version-value">{{ appConfig.appVersion }}</span>
        </span>
        <span class="version-row">
          <span class="version-label">Сборка</span>
          <span class="version-value">{{ appConfig.appCommit }} · {{ appConfig.appBuildDate }}</span>
        </span>
      </button>

      <p v-if="tapMessage" class="dev-mode-message">{{ tapMessage }}</p>

      <p v-if="settings.devMode" class="dev-mode-status">
        <Icon name="mingcute:settings-3-line" size="1rem" />
        <span>Режим разработчика включён — экспериментальные функции доступны в настройках.</span>
      </p>
    </div>

    <!-- Что нового. Сразу под блоком версии: посмотрел, какая версия стоит —
         тут же видишь, что в ней изменилось. За режимом разработчика:
         обычному пользователю список версий ничего не даёт, а обновление PWA
         он и так не замечает. -->
    <section v-if="settings.devMode" class="about-section" data-testid="changelog-section">
      <h2>Что нового</h2>

      <ol class="changelog">
        <li v-for="item in changelogEntries" :key="item.version" class="changelog-item">
          <div class="changelog-head">
            <span class="changelog-version">{{ item.version }}</span>
            <span class="changelog-date">{{ formatChangelogDate(item.date) }}</span>
          </div>
          <ul class="changelog-changes">
            <li v-for="line in item.changes" :key="line">{{ line }}</li>
          </ul>
        </li>
      </ol>

      <button
        v-if="canExpandChangelog"
        type="button"
        class="changelog-toggle"
        data-testid="changelog-toggle"
        @click="changelogExpanded = !changelogExpanded"
      >
        {{ changelogExpanded ? 'Свернуть' : 'Показать все версии' }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { initialTapState, registerTap, shouldHint } from '~/lib/devMode'
import { buildDiagnostics } from '~/lib/diagnostics'
import { readPersisted, getStorageEstimate } from '~/lib/storagePersist'
import { backupStats, readBackupFrom } from '~/lib/collectionsBackup'
import { CHANGELOG, formatChangelogDate, hasMoreChangelog, visibleChangelog } from '~/lib/changelog'

const appConfig = useAppConfig()
const settings = useSettingsStore()
const { pluralize } = useUtils()

const guide = [
  {
    icon: 'mingcute:search-line',
    title: 'Поиск',
    text: 'На главной введите номер песни или слова из текста. Поиск понимает неточный ввод и опечатки.'
  },
  {
    icon: 'mingcute:right-line',
    title: 'Страница песни',
    text: 'Стрелки в верхней панели — соседние песни по номеру. Если у песни несколько вариантов, они переключаются табами над текстом.'
  },
  {
    icon: 'mingcute:star-line',
    title: 'Избранное',
    text: 'Звезда в верхней панели добавляет песню в «Избранное». Ниже текста — подборки, в которые входит песня.'
  },
  {
    icon: 'mingcute:folder-line',
    title: 'Подборки',
    text: 'Свои подборки создавайте со страницы песни, открывайте через меню ☰. «Избранное» всегда первым в списке.'
  },
  {
    icon: 'mingcute:settings-3-line',
    title: 'Настройки',
    text: 'Тема, размер шрифта, запрет гашения экрана и принудительное обновление базы песен.'
  },
  {
    icon: 'mingcute:download-2-line',
    title: 'Установка',
    text: 'Приложение можно установить на телефон кнопкой на главной — тогда оно открывается как обычное и работает без сети.'
  }
]

// === Что нового ===
// Свёрнутый список — только последние версии: полный длиннее самой страницы.
const changelogExpanded = ref(false)
const changelogEntries = computed(() => visibleChangelog(CHANGELOG, changelogExpanded.value))
const canExpandChangelog = hasMoreChangelog(CHANGELOG)

// === Диагностика хранилища ===
const { getSongsCount, getCollections, getAllLinks } = useIndexDB()
const { dbError } = useDbStatus()

const diagnosticsData = ref({})

const visibleDiagnostics = computed(() =>
  buildDiagnostics(diagnosticsData.value).filter((row) => settings.devMode || !row.dev)
)

// Собираем всё разом: страница открывается редко, а частичные данные
// («песен 0», потому что запрос не дошёл) хуже отсутствия блока.
const loadDiagnostics = async () => {
  const storage = typeof navigator === 'undefined' ? null : navigator.storage
  const { $indexedDB } = useNuxtApp()

  const [songs, collections, links, persisted, estimate] = await Promise.all([
    getSongsCount(),
    getCollections(),
    getAllLinks(),
    readPersisted(storage),
    getStorageEstimate(storage)
  ])

  const stored = readBackupFrom(typeof localStorage === 'undefined' ? null : localStorage)

  diagnosticsData.value = {
    songs,
    collections: collections.length,
    links: links.length,
    dbVersion: $indexedDB?.version || null,
    persisted,
    estimate,
    backup: stored.ok ? backupStats(stored.backup) : null
  }
}

onMounted(loadDiagnostics)

// Состояние счётчика тапов держим вне реактивности: в шаблон попадает// только сообщение. Логика подсчёта — в lib/devMode.js.
let tapState = initialTapState()
const tapMessage = ref('')

const onVersionTap = () => {
  if (settings.devMode) {
    tapMessage.value = 'Режим разработчика уже включён. Выключить можно в настройках.'
    return
  }

  tapState = registerTap(tapState, Date.now())

  if (tapState.activated) {
    settings.setDevMode(true)
    tapMessage.value = 'Режим разработчика включён'
    return
  }

  tapMessage.value = shouldHint(tapState.remaining)
    ? `Осталось ${tapState.remaining} ${pluralize(tapState.remaining, 'нажатие', 'нажатия', 'нажатий')}`
    : ''
}
</script>

<style scoped>
.about {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.about-section {
  margin-bottom: 2rem;
}

.about-section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.about-lead {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0 0 1rem;
  line-height: 1.5;
}

.guide {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.guide-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.guide-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
}

.guide-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.guide-text {
  margin: 0;
  padding-left: 1.6rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.changelog {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.changelog-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.changelog-version {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.changelog-date {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.changelog-changes {
  margin: 0.2rem 0 0;
  padding: 0;
  list-style: none;
}

.changelog-changes li {
  position: relative;
  padding-left: 1rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.changelog-changes li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--primary);
}

.changelog-toggle {
  margin-top: 0.9rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--primary);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.diagnostics {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.diagnostics-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  font-size: 0.85rem;
}

.diagnostics-label {
  color: var(--text-secondary);
}

.diagnostics-value {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.diagnostics-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--danger);
  line-height: 1.4;
}

.diagnostics-hint {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.version-block {
  margin-bottom: 1rem;
}

.version-btn {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  /* Быстрые повторные тапы не должны выделять текст или зумить */
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.version-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.85rem;
}

.version-label {
  color: var(--text-secondary);
}

.version-value {
  font-variant-numeric: tabular-nums;
}

.dev-mode-message {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.dev-mode-status {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: var(--primary);
  line-height: 1.4;
}
</style>
