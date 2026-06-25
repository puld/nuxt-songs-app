# План возврата тумблера «Отображение аккордов» в настройки

**Статус:** временно скрыто (коммит `c20e952`)
**Дата скрытия:** 2026-06-25
**Причина скрытия:** не вызывать у пользователей лишние вопросы (функция экспериментальная)

## Что скрыто

Тумблер «Отображение аккордов» на странице настроек (`/settings`).
Функциональность **сохранена**: `settings.showChords`, `setShowChords()`, обработка аккордов в `SongDisplay.vue` — всё работает.
Скрыт только UI-элемент.

## Что нужно сделать для возврата

### 1. `pages/settings.vue`

**Строка ~88** — поменять значение `showChordsSection`:

```js
// Было:
const showChordsSection = ref(false)

// Стало:
const showChordsSection = ref(true)
```

Секция в шаблоне (строки ~33-46) уже обёрнута в `v-if="showChordsSection"` — трогать не надо.

### 2. `test/e2e/specs/settings.spec.js`

**Строка ~51** — убрать `.skip`:

```js
// Было:
test.skip('toggle аккордов переключает showChords', async ({ page }) => {

// Стало:
test('toggle аккордов переключает showChords', async ({ page }) => {
```

Комментарий «ВРЕМЕННО СКИПНУТО» — удалить.

### 3. `test/e2e/journeys/configure-settings.spec.js` (опционально)

В джорни «тёмная тема + крупный шрифт + аккорды применяются к песне» аккорды сейчас включаются через `localStorage` (`addInitScript`). После возврата тумблера можно вернуть UI-клик:

```js
// Сейчас (работает, можно оставить):
await page.addInitScript(() => {
  localStorage.setItem('showChords', 'true')
})

// Или вернуть UI-клик (как было до скрытия):
const chordsSection = page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
const checkbox = chordsSection.locator('input[type="checkbox"]')
const isChecked = await checkbox.isChecked()
if (!isChecked) {
  await chordsSection.locator(s.settings.toggleSwitch).click()
}
await expect(checkbox).toBeChecked()
```

Оба варианта работают. UI-клик предпочтительнее — тестирует реальный пользовательский путь.

## Проверка после возврата

```bash
# E2E-тесты настроек и джорни
npx playwright test test/e2e/specs/settings.spec.js test/e2e/journeys/configure-settings.spec.js --reporter=list

# Ожидаемый результат: все тесты passed, 0 skipped
# (до возврата: 1 skipped — toggle аккордов)
```

Также проверить визуально через браузер: на `/settings` должна быть видна секция «Отображение аккордов» с тумблером Вкл/Выкл.

## Связанные файлы

- `pages/settings.vue` — UI тумблера (строки ~33-46, ~88)
- `stores/settings.js` — `showChords` state, `setShowChords()` action
- `components/SongDisplay.vue` — обработка аккордов в тексте песни
- `test/e2e/specs/settings.spec.js` — test.skip (строка ~51)
- `test/e2e/journeys/configure-settings.spec.js` — addInitScript (строки ~14-16)
- `test/e2e/lib/selectors.js` — `s.settings.toggleSwitch`, `s.settings.section`
