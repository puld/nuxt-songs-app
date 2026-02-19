# Контекст проекта

## Технологический стек
- Nuxt 3 - Vue.js фреймворк
- IndexedDB - клиентское хранилище
- Lunr.js - библиотека поиска
- Pinia - state management
- PWA - progressive web app
- TailwindCSS - CSS фреймворк

## Архитектура приложения

### Основные директории
- `composables/` - composables для логики
- `pages/` - страницы приложения
- `plugins/` - плагины (indexedDB)
- `stores/` - Pinia stores
- `assets/` - статические ресурсы
- `lib/` - вспомогательные библиотеки
- `test/` - тесты и хелперы

### Ключевые файлы
- `composables/useIndexDB.js` - работа с IndexedDB
- `composables/useSongSearch.js` - поиск песен
- `composables/useSongs.js` - загрузка песен
- `plugins/indexedDB.client.js` - инициализация IndexedDB
- `pages/index.vue` - главная страница
- `lib/search.js` - логика поиска с Lunr.js

### Хранилища IndexedDB
1. **songs** - таблица песен (number, title, body)
2. **collections** - подборки песен (id, name, createdAt, updatedAt)
3. **songCollections** - связи песен и подборок (id, collectionId, songNumber)

## Настройки проекта
- Режим: статическая генерация (target: 'static')
- SSR: включен
- Роутинг: hash mode ('#song/123')
- PWA: включен с autoUpdate
- База URL: /nuxt-songs-app/

## Текущие задачи
Нет активных задач

## Проблемы и ограничения
- Плагины работают только на клиенте (.client.js)
- Service Worker кэширует assets/songs.json
- Поисковый индекс пересчитывается только при загрузке страницы
- Подборки хранятся только локально в IndexedDB
