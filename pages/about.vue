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
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { initialTapState, registerTap, shouldHint } from '~/lib/devMode'

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

// Состояние счётчика тапов держим вне реактивности: в шаблон попадает
// только сообщение. Логика подсчёта — в lib/devMode.js.
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
