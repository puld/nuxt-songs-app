# Тестирование полнотекстового поиска

## Рефакторинг для тестируемости

### 1. Создан модуль `lib/search.js`

Содержит чистые функции, не зависящие от Vue реактивности:

- `cleanText(text)` - очистка текста от спецсимволов
- `prepareSongForIndexing(song)` - подготовка песни для индексации
- `buildSearchIndex(songs)` - построение поискового индекса
- `performSearch(searchIndex, query)` - выполнение поиска

### 2. Обновлен `composables/useSongSearch.js`

Теперь использует модуль `lib/search.js` для всей логики поиска.

```javascript
import { buildSearchIndex, performSearch } from '~/lib/search'

export const useSongSearch = () => {
    const searchIndex = ref(null)
    const searchResults = ref([])
    const searchQuery = ref('')

    const buildIndex = (songs) => {
        searchIndex.value = buildSearchIndex(songs)
    }

    const search = (query) => {
        searchResults.value = performSearch(searchIndex.value, query)
    }

    return {
        searchIndex,
        searchResults,
        searchQuery,
        buildIndex,
        search
    }
}
```

### 3. Настроен Vitest

- Установлены зависимости: `vitest`, `@vitest/ui`, `happy-dom`, `@vue/test-utils`
- Создан `vitest.config.js`
- Добавлены скрипты в `package.json`:
  - `npm test` - запуск тестов
  - `npm run test:ui` - запуск с UI
  - `npm run test:coverage` - запуск с покрытием кода

### 4. Поддержка русского языка

Установлен `lunr-languages` для корректной работы с кириллицей.

```javascript
import lunr from 'lunr'
require('lunr-languages/lunr.stemmer.support')(lunr)
require('lunr-languages/lunr.ru')(lunr)

// Используем русский язык в индексе
export const buildSearchIndex = (songs) => {
    return lunr(function() {
        this.use(lunr.ru)  // Подключаем русский язык
        this.ref('n')
        this.field('title', { boost: 3 })
        this.field('content', { boost: 1 })
        // ...
    })
}
```

## Тесты

### Модульные тесты (`lib/search.test.js`)

Покрывают чистые функции поиска:

- **cleanText**
  - Удаление спецсимволов
  - Схлопывание множественных пробелов
  - Удаление пробелов в начале и в конце

- **prepareSongForIndexing**
  - Подготовка песни для индексации
  - Обработка пустого массива body
  - Объединение содержимого всех частей

- **buildSearchIndex**
  - Создание поискового индекса
  - Индексация заголовков с бустом
  - Индексация содержимого песен

- **performSearch**
  - Поиск по заголовку
  - Поиск по содержимому
  - Нечеткий поиск (опечатки)
  - Сортировка по релевантности
  - Обработка ошибок

### Интеграционные тесты (`composables/useSongSearch.test.js`)

Покрывают работу Vue composable:

- Инициализация и возвращение реактивных переменных
- Построение индекса
- Выполнение поиска и обновление результатов
- Повторное построение индекса
- Обновление результатов при новом запросе

## Запуск тестов

```bash
# Запуск всех тестов
npm test

# Запуск с watch режимом
npm test

# Запуск с UI
npm run test:ui

# Запуск с покрытием кода
npm run test:coverage
```

## Покрытие кода

Тесты покрывают:
- `lib/search.js` - все функции
- `composables/useSongSearch.js` - все методы composable

Для запуска генерации отчета о покрытии:

```bash
npm run test:coverage
```

Результаты будут сохранены в директории `coverage/` в формате:
- `text` - консольный вывод
- `json` - JSON для интеграции с CI/CD
- `html` - HTML отчет для ручного просмотра
