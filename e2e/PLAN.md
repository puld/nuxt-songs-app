# План: E2E тесты поиска с Playwright

## Цель

Организовать автоматические браузерные тесты для поиска песен, которые можно запускать механически (без LLM). Тесты проверяют реальную работу поиска в приложении: ввод запроса, анализ DOM-результатов.

## Шаги реализации

### 1. Установка Playwright Test

```bash
npm install -D @playwright/test
npx playwright install chromium
```

### 2. Конфигурация `playwright.config.js`

```js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
})
```

### 3. Скрипт в `package.json`

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

### 4. Файл тест-кейсов `e2e/search-cases.js`

Отдельный файл с тест-кейсами — легко редактировать и расширять без знания Playwright.

```js
// Каждый кейс: { query, expectedNumbers, description }
// expectedNumbers — массив номеров песен, которые ДОЛЖНЫ быть в результатах
// Порядок не важен — проверяем наличие, не ранжирование
export const searchCases = [
  // === Точный поиск по названию ===
  { query: 'повесть любви', expectedNumbers: [1], description: 'точный: «повесть любви» → песня 1 по названию' },
  { query: 'молитвы час', expectedNumbers: [2], description: 'точный: «молитвы час» → песня 2 по названию' },
  { query: 'потоки', expectedNumbers: [7], description: 'точный: «потоки» → песня 7 по названию' },
  { query: 'благословений пот', expectedNumbers: [7], description: 'точный: начало названия «благословений пот» → песня 7' },

  // === Точный поиск по тексту (подстрока) ===
  { query: 'Бог нас навеки', expectedNumbers: [1], description: 'точный: «Бог нас навеки» → песня 1 по тексту' },
  { query: 'не оставлю вас', expectedNumbers: [11], description: 'точный: «не оставлю вас» → песня 11 по тексту' },
  { query: 'спешит олень', expectedNumbers: [14], description: 'точный: «спешит олень» → песня 14 по тексту' },

  // === Подстроки без границы слова ===
  { query: 'повест', expectedNumbers: [1, 9], description: 'точный: «повест» → песни 1 и 9 (повесть)' },
  { query: 'благ', expectedNumbers: [5, 9, 10, 12, 13, 19], description: 'точный: «благ» → песни с «благая/благодать/благую»', minExpected: 3 },

  // === Lunr: опечатки и морфология ===
  { query: 'повестб', expectedNumbers: [1], description: 'Lunr: опечатка «повестб» → песни с «повесть»' },
  { query: 'малилвы', expectedNumbers: [2], description: 'Lunr: опечатка «малилвы» → «молитвы»' },
  { query: 'блогословений', expectedNumbers: [7], description: 'Lunr: опечатка «блогословений» → «благословений»' },

  // === Комбинированные кейсы ===
  { query: 'Спаситель говори', expectedNumbers: [11], description: 'unified: «Спаситель говори» → песня 11' },
  { query: 'сердца детей', expectedNumbers: [12], description: 'unified: «сердца детей» → песня 12' },
  { query: 'радостно сладко', expectedNumbers: [17], description: 'unified: «радостно сладко» → песня 17' },
]
```

### 5. Спецификация `e2e/search.spec.js`

```js
import { test, expect } from '@playwright/test'
import { searchCases } from './search-cases'

test.describe('Поиск песен', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Ждём загрузки песен в IndexedDB
    await page.waitForSelector('.search-input', { timeout: 10000 })
  })

  for (const { query, expectedNumbers, description, minExpected } of searchCases) {
    test(description, async ({ page }) => {
      // Вводим запрос
      await page.fill('.search-input', query)
      // Ждём появления результатов
      await page.waitForSelector('.result-item', { timeout: 5000 })
      // Собираем номера найденных песен
      const resultNumbers = await page.locator('.song-number').allTextContents()
      const numbers = resultNumbers.map(n => parseInt(n.trim()))

      // Проверяем что все ожидаемые номера присутствуют
      for (const expected of expectedNumbers) {
        expect(numbers).toContain(expected)
      }

      // Если указан minExpected — проверяем минимум
      if (minExpected) {
        expect(numbers.length).toBeGreaterThanOrEqual(minExpected)
      }
    })
  }
})
```

### 6. Расширение: проверка ранжирования (опционально)

Для проверки порядка результатов можно добавить отдельный набор кейсов:

```js
export const rankingCases = [
  { query: 'повесть', expectedFirst: 1, description: '«повесть» — точный результат выше Lunr' },
  { query: 'молитвы', expectedFirst: 2, description: '«молитвы» — точный результат выше Lunr' },
]
```

Тест проверяет `numbers[0] === expectedFirst`.

### 7. Расширение: поиск по номеру

```js
export const numberCases = [
  { number: 1, expectedTitle: 'Слушайте повесть любви в простоте' },
  { number: 235, expectedTitle: 'Со Христом бодрее' },
]
```

Тест: вводим номер → Enter → проверяем переход на страницу песни.

### 8. Адаптивная высота выпадающего списка результатов

Выпадающий список результатов поиска на главной странице должен:
- на достаточно большом экране показывать все результаты без скролла;
- на маленьком экране занимать доступное место и показывать скролл, не выходя за пределы viewport.

Реализовано через CSS `max-height: calc(100dvh - 210px)` (с `vh`-фолбэком) в классе `.search-results`. Prop `max-results-height` при передаче переопределяет значение inline-стилем (используется на странице песни, где `max-results-height="none"`).

#### 8.1 Большой экран — все результаты без скролла

```js
test('большой экран: 7 результатов без скролла', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.waitForSelector('.search-input', { timeout: 10000 })

  await page.fill('.search-input', 'Бог')
  await page.waitForSelector('.result-item', { timeout: 5000 })

  const info = await page.evaluate(() => {
    const r = document.querySelector('.search-results')
    const s = getComputedStyle(r)
    return {
      scrollHeight: r.scrollHeight,
      clientHeight: r.clientHeight,
      maxHeight: s.maxHeight,
      childCount: r.children.length,
      viewportHeight: window.innerHeight,
    }
  })

  // Все 7 результатов в DOM
  expect(info.childCount).toBe(7)
  // max-height = calc(100dvh - 210px) = 900 - 210 = 690
  expect(info.maxHeight).toBe('690px')
  // Контент помещается — скролла нет
  expect(info.scrollHeight).toBe(info.clientHeight)
})
```

#### 8.2 Маленький экран — скролл, дропдаун в пределах viewport

```js
test('маленький экран: появляется скролл, дропдаун в пределах экрана', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 })
  await page.goto('/')
  await page.waitForSelector('.search-input', { timeout: 10000 })

  await page.fill('.search-input', 'Бог')
  await page.waitForSelector('.result-item', { timeout: 5000 })

  const info = await page.evaluate(() => {
    const r = document.querySelector('.search-results')
    const s = getComputedStyle(r)
    const rect = r.getBoundingClientRect()
    return {
      scrollHeight: r.scrollHeight,
      clientHeight: r.clientHeight,
      maxHeight: s.maxHeight,
      childCount: r.children.length,
      rectBottom: rect.bottom,
      viewportHeight: window.innerHeight,
    }
  })

  // Все 7 результатов в DOM
  expect(info.childCount).toBe(7)
  // max-height = calc(100dvh - 210px) = 480 - 210 = 270
  expect(info.maxHeight).toBe('270px')
  // Контент больше max-height — скролл появился
  expect(info.scrollHeight).toBeGreaterThan(info.clientHeight)
  // Дропдаун не выходит за пределы viewport (с запасом снизу)
  expect(info.rectBottom).toBeLessThanOrEqual(info.viewportHeight)
})
```

#### 8.3 Popover на странице песни — inline `max-height: none` переопределяет CSS

```js
test('popover на странице песни: max-height: none, без скролла', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/song/106')
  await page.waitForSelector('h1', { timeout: 10000 })

  // Открываем popover «Перейти к песне»
  await page.getByRole('button', { name: 'Перейти к песне' }).click()
  await page.waitForSelector('.search-input', { timeout: 5000 })

  await page.fill('.search-input', 'Бог')
  await page.waitForSelector('.result-item', { timeout: 5000 })

  const info = await page.evaluate(() => {
    const r = document.querySelector('.search-results')
    const s = getComputedStyle(r)
    return {
      inlineMaxHeight: r.style.maxHeight,
      computedMaxHeight: s.maxHeight,
      scrollHeight: r.scrollHeight,
      clientHeight: r.clientHeight,
      childCount: r.children.length,
    }
  })

  // Inline-стиль из prop max-results-height="none"
  expect(info.inlineMaxHeight).toBe('none')
  // Inline переопределяет CSS-класс calc(100dvh - 210px)
  expect(info.computedMaxHeight).toBe('none')
  // Все 7 результатов в DOM
  expect(info.childCount).toBe(7)
  // Скролла нет — popover позволяет расти естественно
  expect(info.scrollHeight).toBe(info.clientHeight)
})
```

## Структура файлов

```
e2e/
├── search-cases.js           # Тест-кейсы поиска (редактируемые)
├── search.spec.js            # Playwright спецификация: корректность результатов
├── search-layout.spec.js     # Playwright спецификация: адаптивная высота dropdown (раздел 8)
└── README.md                 # Инструкция по запуску
```

## Запуск

```bash
# Установить зависимости (один раз)
npm install

# Запустить все E2E тесты
npm run test:e2e

# Запустить с UI
npx playwright test --ui

# Запустить конкретный тест
npx playwright test -g "повесть любви"
```

## Примечания

- `reuseExistingServer: true` — если dev-сервер уже запущен, Playwright использует его
- Тесты работают с реальными данными из `public/assets/songs.json`
- Для CI можно добавить отдельный скрипт с `npm run build && npm run start` вместо dev-сервера
- Результаты поиска обновляются на каждый ввод символа (`@input`), поэтому `page.fill()` автоматически триггерит поиск
