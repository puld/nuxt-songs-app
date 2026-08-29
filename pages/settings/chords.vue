<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Аккорды</span>
    </Teleport>
  </ClientOnly>

  <div class="settings">
    <!-- Гейт скрывает вход в меню, но прямой URL остаётся рабочим (ssr: false —
         статика генерируется для всех маршрутов). Показываем объяснение,
         иначе случайный переход выглядит как поломка. -->
    <div v-if="!settings.devMode" class="stub">
      <p class="stub-title">Экспериментальный экран</p>
      <p class="stub-text">Настройки аккордов пока доступны только в режиме разработчика.</p>
      <NuxtLink to="/settings" class="stub-link">К настройкам</NuxtLink>
    </div>

    <template v-else>
      <!-- Заблокированы, а не скрыты, пока аккорды выключены: исчезающие строки
           дёргали бы страницу при каждом переключении, а о самой возможности
           упростить аккорды узнать было бы неоткуда. -->
      <div class="setting-section">
        <label class="toggle-switch sub-toggle simplify-toggle" :class="{ disabled: !settings.showChords }">
          <input
              type="checkbox"
              :checked="settings.simplifyChords"
              :disabled="!settings.showChords"
              @change="handleSimplifyChordsToggle"
          >
          <span class="slider"></span>
          <span class="toggle-label">Упростить для гитары</span>
        </label>
        <p class="setting-hint">
          Снимает бас после косой черты (G/B → G) и заменяет sus4, sus2,
          уменьшённые и увеличенные обозначения (например, sus4, dim, m7b5, +)
          на ближайший простой мажор, минор или септаккорд. Аккорды сняты с
          партитуры, а не под гитару, и то и другое там обычно избыточно.
        </p>

        <!-- Заблокирован, пока выключено само упрощение — это его уточнение,
             а не независимая настройка (см. collapseRepeats в сторе) -->
        <label
            class="toggle-switch sub-toggle nested-toggle collapse-repeats-toggle"
            :class="{ disabled: !settings.simplifyChords }"
        >
          <input
              type="checkbox"
              :checked="settings.collapseRepeats"
              :disabled="!settings.simplifyChords"
              @change="handleCollapseRepeatsToggle"
          >
          <span class="slider"></span>
          <span class="toggle-label">Схлопывать повтор корня</span>
        </label>
        <p class="setting-hint nested-hint">
          Если несколько аккордов подряд стоят на одном корне (например,
          C → C7 → C), показывается только первый — остальные лишь уточняли
          аккорд, который и так не меняется.
        </p>
      </div>

      <div class="setting-section">
        <label class="toggle-switch sub-toggle force-sharp-toggle" :class="{ disabled: !settings.showChords }">
          <input
              type="checkbox"
              :checked="settings.forceSharp"
              :disabled="!settings.showChords"
              @change="handleForceSharpToggle"
          >
          <span class="slider"></span>
          <span class="toggle-label">Диезы вместо бемолей: Gb → F#</span>
        </label>
        <p class="setting-hint">
          На гитаре диезы читать привычнее — тумблер игнорирует принятую для
          тональности запись и всегда показывает диезы.
        </p>
      </div>

      <div class="setting-section">
        <label class="toggle-switch sub-toggle german-notation-toggle" :class="{ disabled: !settings.showChords }">
          <input
              type="checkbox"
              :checked="settings.germanNotation"
              :disabled="!settings.showChords"
              @change="handleGermanNotationToggle"
          >
          <span class="slider"></span>
          <span class="toggle-label">Немецкая нотация: си — H, си-бемоль — B</span>
        </label>
        <p class="setting-hint">
          Ля-минор без баррэ на гитаре, баррэ на 1 ладу — «B», на 2-м — «H»:
          так эту пару ступеней называют в русской и немецкой традиции, в
          отличие от английской, где «B» — это си. На остальные ноты не влияет.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

const settings = useSettingsStore()

const handleSimplifyChordsToggle = (e) => {
  settings.setSimplifyChords(e.target.checked)
}

const handleCollapseRepeatsToggle = (e) => {
  settings.setCollapseRepeats(e.target.checked)
}

const handleForceSharpToggle = (e) => {
  settings.setForceSharp(e.target.checked)
}

const handleGermanNotationToggle = (e) => {
  settings.setGermanNotation(e.target.checked)
}
</script>

<style scoped>
.settings {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.setting-section {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.setting-section:last-child {
  border-bottom: none;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  background-color: var(--toggle-off);
  border-radius: 24px;
  transition: .4s;
}

.slider:before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: .4s;
}

input:checked + .slider {
  background-color: var(--primary);
}

input:checked + .slider:before {
  transform: translateX(26px);
}

.toggle-label {
  user-select: none;
}

.sub-toggle.disabled {
  opacity: 0.5;
  cursor: default;
}

/* Вложенный тоггл — уточнение родительского, а не равноправная настройка */
.nested-toggle {
  margin-top: 1rem;
  margin-left: 1.5rem;
}

.nested-hint {
  margin-left: 1.5rem;
}

.setting-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.4rem;
  margin-bottom: 0;
}

.stub {
  text-align: center;
  padding: 2rem 1rem;
}

.stub-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.5rem;
}

.stub-text {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.stub-link {
  color: var(--primary);
  text-decoration: none;
}
</style>
