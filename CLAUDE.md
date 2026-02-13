# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Основные команды

### Разработка
```bash
npm run dev          # Запуск dev-сервера на порту 3000
npm run build        # Сборка для production
npm run generate     # Генерация статического сайта (для деплоя на GitHub Pages)
npm run start        # Запуск production-сервера (после build)
```

### Парсинг текстовых файлов
```bash
npm run parse-txt    # Парсинг doc.txt в result.json (использует scripts/parseTxt.js)
```

## Архитектура приложения

### Технологический стек
- **Nuxt 3** - Vue.js фреймворк для SSR/SSG
- **IndexedDB** - Клиентское хранилище для оффлайн-доступа к песням и подборкам
- **Lunr.js** - Библиотека полнотекстового поиска с нечетким совпадением
- **Pinia** - State management (хранит настройки пользователя)
- **PWA** - Progressive Web App с Service Worker для оффлайн работы
- **TailwindCSS** - CSS фреймворк

### Режим работы
- `target: 'static'` - Статическая генерация сайта
- `ssr: true` - Server-side rendering включен
- Режим роутинга: `'hash'` (важно для GitHub Pages)

### Структура базы данных IndexedDB

Плагин `plugins/indexedDB.client.js` инициализирует три хранилища:

1. **songs** - Таблица песен
   - `number` (key) - номер песни
   - `title` - название песни
   - `body` - массив частей песни (куплеты, припевы)

2. **collections** - Подборки песен
   - `id` (key, autoIncrement) - ID подборки
   - `name` - название подборки
   - `createdAt`, `updatedAt` - метки времени

3. **songCollections** - Связующая таблица many-to-many
   - `id` (key, autoIncrement) - ID связи
   - `collectionId` - ID подборки (есть индекс)
   - `songNumber` - номер песни (есть индекс)
   - Индекс `collectionId_songNumber` для уникальности связей

### Основные Composables

#### `useIndexDB` (composables/useIndexDB.js)
Работает с IndexedDB через `$indexedDB`, предоставляемый плагином.

**Методы для песен:**
- `addSongs(songs)` - Загружает все песни (предварительно очищает хранилище)
- `getSong(number)` - Получает песню по номеру
- `getAllSongs()` - Получает все песни
- `getSongsCount()` - Возвращает количество песен
- `getSongNumbers()` - Получает список номеров всех песен

**Методы для подборок:**
- `createCollection(name)` - Создаёт новую подборку
- `getCollections()` - Получает все подборки
- `deleteCollection(id)` - Удаляет подборку и все её связи
- `getCollection(id)` - Получает одну подборку

**Методы для связей песен и подборок:**
- `addSongToCollection(collectionId, songNumber)` - Добавляет песню в подборку
- `removeSongFromCollection(collectionId, songNumber)` - Удаляет песню из подборки
- `getSongsInCollection(collectionId)` - Получает все песни подборки
- `getCollectionsForSong(songNumber)` - Получает подборки, содержащие песню
- `getAvailableCollections(songNumber)` - Получает подборки, в которые можно добавить песню
- `getSongsCountInCollection(collectionId)` - Подсчитывает песни в подборке

#### `useSongSearch` (composables/useSongSearch.js)
Использует Lunr.js для полнотекстового поиска.

**Настройки поиска:**
- Поле `title` имеет boost: 3 (больший вес)
- Поле `content` имеет boost: 1 (стандартный вес)
- Отключен фильтр стоп-слов для поиска по всем словам
- Нечеткий поиск с расстоянием Левенштейна ~1
- Спецсимволы (/()!?.,;:"'-) удаляются перед индексацией

**Методы:**
- `buildIndex(songs)` - Строит поисковый индекс из массива песен
- `search(query)` - Выполняет поиск по запросу
- `searchIndex`, `searchResults`, `searchQuery` - реактивные переменные

#### `useSongs` (composables/useSongs.js)
Загрузка песен из файла.

- `fetchSongs()` - Загружает songs.json из assets/ и сохраняет в IndexedDB

### Поиск и навигация

Главный экран (`pages/index.vue`) предоставляет:
- Полнотекстовый поиск по текстам песен и названиям
- Прямой выбор песни по номеру (1-N)

Поисковый индекс строится один раз при загрузке приложения на основе всех песен из IndexedDB.

### PWA и оффлайн режим

Конфигурация PWA в `nuxt.config.js`:
- Кэширует статические файлы
- Использует стратегию `NetworkFirst` для `assets/songs.json` с 30-дневным TTL
- Автоматическое обновление (registerType: 'autoUpdate')
- Периодическая проверка обновлений каждые 20 сессий

### Настройки пользователя

Store `stores/settings.js` (Pinia с persist):
- `fontSize` - размер шрифта ('small', 'medium', 'large')
- `showChords` - отображение аккордов (true/false)

### Парсинг текстовых файлов

Скрипт `scripts/parseTxt.js` парсит txt файл в JSON:
- Разделяет текст на разделы по линии подчёркиваний (`________`)
- Извлекает песни по паттерну "X. Y. " или "Припев:"
- Разделяет песни на куплеты и припевы
- Сохраняет результат в `tmp/result.json`

## Деплой на GitHub Pages

1. Убедитесь, что `app.baseURL` и `router.base` настроены на `/nuxt-songs-app/`
2. Запустите `npm run generate` для создания статического сайта в `.output/public/`
3. Используйте GitHub Actions workflow из README.md для автоматического деплоя
4. Установите в Settings → Pages: Deploy from branch `gh-pages`, folder `/ (root)`

## Важные детали

### Путь к базе данных песен
Файл `songs.json` должен находиться в `public/assets/songs.json` для кэширования через PWA Service Worker. При локальной разработке он доступен как `/assets/songs.json`.

### Хеширование в URL
Роутинг использует hash mode (`#song/123`) вместо обычного для корректной работы на GitHub Pages без настройки сервера.

### Индексация поиска
Поисковый индекс пересчитывается только при загрузке страницы. После добавления новых песен через настройки нужно перезагрузить страницу.

### Поддержка тем
Приложение использует `@nuxtjs/color-mode` с поддержкой:
- `system` - системная тема (по умолчанию)
- `light` - светлая тема
- `dark` - тёмная тема

CSS переменные темы определены в `assets/css/main.css` и используются через Tailwind.
