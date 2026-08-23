# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Правила коммитов

- НЕ добавлять `Generated with [Claude Code]` в сообщения коммитов
- НЕ добавлять `Co-Authored-By: Claude` в сообщения коммитов

## Правила редизайна

- ВСЕ изменения UI проверять визуально через браузер (Playwright screenshot/snapshot) до коммита

## Правила тестирования

- Писать тестопригодный код: выделять чистые функции без Vue-зависимостей в `lib/`, composables — тонкие обёртки
- Покрывать новый код тестами сразу при реализации, а не после
- Чистые функции тестировать в `lib/*.test.js`, composables — в `composables/*.test.js`

## Правила версионирования

- Версия живёт **только** в `package.json`; `nuxt.config.js` читает её в `appConfig.appVersion`, страница `/about` показывает
- Инкремент — вручную, в том же коммите, что и доработка: `npm version <patch|minor|major> --no-git-tag-version` (обновляет и `package-lock.json`, тег и коммит не создаёт)
- Semver по смыслу для пользователя: новые экраны и функции — `minor`, исправления и мелкие правки — `patch`, несовместимая смена схемы данных или формата песен — `major`
- Правки только документации версию не двигают

## Справочники (читать по необходимости)

Редко нужные детали вынесены из этого файла, чтобы не занимать контекст в каждом запросе:

| Файл | Когда нужен |
|------|-------------|
| `docs/reference/song-format.md` | Правка текстов песен, парсера `songs-data/parse.js`, линтера; формат `.txt`, аккорды, повторы, схема `songs.json` |
| `docs/reference/search-lunr.md` | Настройка ранжирования поиска, разбор «песня не находится»; API `lib/search.js` и особенности Lunr |
| `docs/reference/legacy-parse-txt.md` | Только для старого пайплайна `scripts/parseTxt.js` (`tmp/doc.txt`) |
| `docs/roadmap.md` | **Единственный источник плана**: что осталось (фазы 3–6), что закрыто, backlog и техдолг. Спецификация `docs/specs/spec-v1.md` описывает целевое поведение, а не план |
| `.claude/handoffs/README.md` | Формат handoff'ов между сессиями и их ротация. **Локальный файл**: каталог `.claude/` в `.gitignore`, в свежем клоне его нет |

## Основные команды

### Разработка
```bash
npm run dev          # songs:parse + dev-сервер на 0.0.0.0:3000
npm run build        # songs:parse + сборка для production
npm run generate     # songs:parse + генерация статики (SSG для GitHub Pages)
npm run start        # Запуск production-сервера (после build)
```

`dev`, `build` и `generate` **сами пересобирают** `public/assets/songs.json` из `songs-data/` — отдельно вызывать парсер не нужно.

### Данные песен
```bash
npm run songs:parse    # songs-data/songs/*.txt + sections.json → public/assets/songs.json
npm run songs:lint     # Линтер формата .txt (node songs-data/lint.js --staged — только staged)
npm run songs:convert  # Обратная операция: songs.json → songs-data/songs/*.txt
node songs-data/verify.js  # Верификация: текст не потерян при переразбивке на строфы
npm run parse-txt      # LEGACY: tmp/doc.txt → tmp/result.json (scripts/parseTxt.js)
```

### Тестирование
```bash
npm test              # Unit-тесты (Vitest)
npm run test:ui       # Vitest UI
npm run test:coverage # Покрытие (v8 provider)
npm run test:e2e      # E2E-тесты (Playwright)
npm run test:e2e:headed / test:e2e:ui
```

## Архитектура приложения

### Технологический стек
- **Nuxt 3** (~3.9) — Vue.js фреймворк, режим SSG без SSR (см. «Режим работы Nuxt»)
- **Vue 3** (~3.3) — реактивный UI
- **IndexedDB** — клиентское хранилище для оффлайн-доступа к песням и подборкам
- **Lunr.js** (~2.3) + **lunr-languages** — полнотекстовый поиск с русским стеммингом
- **Pinia** (~3.0) — state management (настройки пользователя)
- **@vueuse/core** — утилиты (`useStorage` для персистентности настроек)
- **@vite-pwa/nuxt** — PWA с Service Worker для оффлайн работы
- **@nuxtjs/color-mode** — светлая/тёмная/системная тема
- **@nuxt/icon** — иконки (mingcute)
- **TailwindCSS** (~3.4) — CSS фреймворк
- **Vitest** (~4.0) + **happy-dom** + **fake-indexeddb** — unit-тесты
- **Playwright** — e2e-тесты
- **husky** — git-хуки (`npm run prepare`)

### Режим работы Nuxt
- `ssr: false` — SPA-режим: `nuxt generate` выдаёт статику, но страницы рендерятся только в браузере. Ключа `target` в Nuxt 3 нет
- URL песен без хеша: `/song/115` (НЕ `/#/song/115`)
- `app.baseURL`: `/nuxt-songs-app/` в production, `/` в development
- Dev-сервер слушает `0.0.0.0:3000` (`devServer` в `nuxt.config.js`) — чтобы открывать сборку с телефона по локальной сети

## Структура проекта

```
├── assets/css/main.css       # CSS переменные тем + Tailwind imports
├── components/
│   ├── LoadingText.vue       # Индикатор загрузки с текстом
│   ├── NavBarBack.vue        # Кнопка «назад» в навбаре
│   ├── NavBarHamburger.vue   # Кнопка меню (inject toggleSidebar/updateAvailable)
│   ├── RestoreBackupToast.vue # Предложение восстановить подборки из копии
│   ├── SettingToggle.vue     # Кнопка-переключатель настроек
│   ├── SongCard.vue          # Карточка песни (не используется в страницах)
│   ├── SongDisplay.vue       # Текст песни с аккордами, повторами и табами вариантов
│   ├── SongSearchInput.vue   # Поле поиска + выдача (поиск по тексту и по номеру)
│   └── UpdateToast.vue       # Тост «доступно обновление базы»
├── composables/
│   ├── useAutoUpdate.js      # Проверка обновления songs.json по ETag
│   ├── useCollectionsBackup.js # Восстановление подборок из копии, экспорт/импорт
│   ├── useDbStatus.js        # Состояние БД: ошибка открытия, persistent-хранилище
│   ├── useIndexDB.js         # IndexedDB: песни, подборки, связи, избранное
│   ├── useLayoutCommon.js    # Общая логика layout: навбар, wake lock, автообновление
│   ├── useSongs.js           # Загрузка songs.json в IndexedDB
│   ├── useSongsCache.js      # Модульный кэш песен: allSongs, songNumbers, songsMap
│   ├── useSongSearch.js      # Vue-обёртка для поиска (индексы — синглтон)
│   ├── useWakeLock.js        # Обёртка над Wake Lock API
│   └── utils.js              # pluralize для русского языка
├── layouts/
│   └── default.vue           # Smart Navbar + выдвижной сайдбар
├── lib/                      # Чистые функции без Vue (+ тесты рядом)
│   ├── autoUpdate.js         # ETag-логика автообновления
│   ├── collectionsBackup.js  # Копия подборок: сборка, разбор, план импорта
│   ├── dbMigrations.js       # Миграции IndexedDB: приведение старой базы к текущей схеме
│   ├── dbSchema.js           # Схема IndexedDB: имя, версия, createSchema
│   ├── devMode.js            # Активация режима разработчика тапами по версии
│   ├── diagnostics.js        # Строки блока «Состояние хранилища» на /about
│   ├── repeats.js            # Разбор повторов (реприз) в тексте
│   ├── search.js             # Поиск (Lunr.js)
│   ├── songsIndex.js         # Карта «номер → песня», названия и метки вариантов
│   ├── storagePersist.js     # navigator.storage: постоянное хранилище и оценка места
│   └── wakeLock.js           # Менеджер Wake Lock
├── pages/
│   ├── index.vue             # Главная: поиск + подсказки
│   ├── about.vue             # О приложении: шпаргалка, версия, dev-режим, диагностика
│   ├── settings.vue          # Настройки
│   ├── song/[number].vue     # Страница песни
│   └── collections/[id].vue  # Подборка: список песен
├── plugins/
│   └── indexedDB.client.js   # Инициализация IndexedDB + миграции (client-only)
├── stores/
│   └── settings.js           # Pinia store настроек
├── songs-data/               # ИСТОЧНИК ДАННЫХ (см. docs/reference/song-format.md)
│   ├── songs/NNNN.txt        # 1565 файлов песен
│   ├── sections.json         # Разделы сборника
│   ├── parse.js              # .txt → songs.json
│   ├── lint.js               # Линтер формата .txt
│   ├── convert.js            # songs.json → .txt (обратная операция)
│   └── verify.js             # Проверка сохранности текста при переразбивке
├── scripts/parseTxt.js       # LEGACY-парсер (tmp/doc.txt)
├── public/assets/songs.json  # Собранная база песен (генерируется, кэшируется PWA)
├── static/                   # Иконки PWA, favicon
├── docs/                     # roadmap.md — план работ; specs/ — спецификация; reference/ — справочники
├── test/
│   ├── setup.js              # Глобальный setup для Vitest
│   ├── helpers/              # Моки IndexedDB, NuxtApp, fetch
│   ├── fixtures/             # Данные для unit-тестов
│   └── e2e/                  # Playwright: specs/, journeys/, lib/, data/
├── nuxt.config.js
├── playwright.config.js
└── vitest.config.js
```

## Структура базы данных IndexedDB

Плагин `plugins/indexedDB.client.js` (client-only) инициализирует БД `SongsDB` **версии 6** с тремя хранилищами. При пустой базе плагин сам вызывает `fetchSongs()` — песни грузятся автоматически при первом запуске.

Имя базы, версия и создание хранилищ/индексов — в `lib/dbSchema.js` (`DB_NAME`, `DB_VERSION`, `createSchema`). Оттуда их берут и плагин, и тесты. Миграции — в `lib/dbMigrations.js`: они зависят от `oldVersion` и работают с транзакцией апгрейда, но вынесены из плагина, чтобы прогоняться в тестах.

### songs
- `number` (keyPath) — номер песни
- `title` — название песни
- `variants` — массив вариантов:
  - `label` — метка варианта (пустая строка для единственного; `"а"`, `"б"` или описательная — `"вариант для сестёр"`)
  - `body` — массив частей: `id` (сквозной в пределах песни), `n` (номер куплета/припева), `type` (`'verse'` / `'chorus'`), `content` (текст, может содержать аккорды в фигурных скобках), `repeatId` (опционально)

Обратная совместимость: если `variants` отсутствует, используется `song.body`.

### collections
- `id` (keyPath, autoIncrement), `name`, `createdAt`, `updatedAt` (ISO)
- `isFavorite` — `1` у единственной системной подборки «Избранное» (индекс `isFavorite`)
- Индекс `name`

Подборка «Избранное» создаётся автоматически: в миграциях и при старте плагина, если её нет.

### songCollections (many-to-many)
- `id` (keyPath, autoIncrement), `collectionId`, `songNumber`, `variantIndex`, `addedAt` (ISO)
- Индексы: `collectionId`, `songNumber`, `collectionId_songNumber` (не уникальный), `collectionId_songNumber_variantIndex` (**уникальный**)

В подборку добавляется конкретный **вариант** песни — ключ связи включает `variantIndex`.

### Миграции (`lib/dbMigrations.js`)

`runMigrations(db, transaction, oldVersion)` вызывается из `onupgradeneeded` после `createSchema(db)`. Шаги описывают **целевое состояние** и идемпотентны, а не образуют лестницу «v3→v4, v4→v5»: прежняя лестница пересекалась сама с собой (v3→v4 создавал уникальный индекс в асинхронном колбэке, v5→v6 синхронно видел, что индекса нет, и создавал второй — апгрейд падал).

Шаги: `body` → `variants` (только с v1); снятие уникальности с `collectionId_songNumber`; удаление устаревших индексов связей; нормализация связей; создание уникального `collectionId_songNumber_variantIndex`; индекс `isFavorite`; создание «Избранного».

Правила, которые нельзя нарушать при доработке:
- **Сначала нормализация связей, потом уникальный индекс.** До v4 ключ включал `variantLabel`, поэтому песня легально лежала в подборке в двух вариантах. Дубли не удаляются, а сдвигаются на свободный `variantIndex` — иначе `ConstraintError` откатывает транзакцию апгрейда, и приложение выглядит так, будто данных нет вообще.
- **Никаких `await` между шагами** — пауза без активных запросов закрывает транзакцию апгрейда. Шаги связаны колбэками (`runSteps`).
- **Никаких `clear()` перед повторной записью** — обход курсором с `update`, иначе сбой в середине оставляет хранилище пустым.

При изменении схемы править `lib/dbSchema.js` — `DB_VERSION` и `createSchema` там в одном месте для приложения и тестов; шаг миграции дописывать в `lib/dbMigrations.js` и покрывать в `lib/dbMigrations.test.js` (там апгрейд прогоняется с каждой из версий 1–5).

### Отказ базы не роняет приложение

`plugins/indexedDB.client.js` никогда не реджектится: при неудачном открытии он провайдит `$indexedDB = null`, пишет причину в `useDbStatus()` и продолжает. `useIndexDB` это переживает — чтения возвращают пустой результат, записи бросают «База данных недоступна». Раньше единственная ошибка апгрейда обнуляла всё приложение, а причина уходила только в консоль, до которой на телефоне не добраться.

### Резервная копия подборок (localStorage)

Подборки живут только в IndexedDB, которую браузер вправе освободить. Копия (имена подборок + связи «подборка — песня», без текстов) лежит в localStorage под ключом `collectionsBackup` — отдельном хранилище, которое обычно переживает eviction IndexedDB.

- Снимается автоматически после каждой мутации подборок — в `useIndexDB` (`withBackup`), а не на страницах: мест вызова полдюжины, и любое забытое означало бы устаревшую копию
- Чистые функции — `lib/collectionsBackup.js`; в composable только обращения к базе и хранилищу
- **Осмысленная копия не затирается пустой** (`shouldReplaceBackup`): после потери данных «Избранное» пересоздаётся, и первое же изменение стёрло бы единственный след прежних подборок
- Восстановление предлагается (`RestoreBackupToast`) только когда копия содержательна, а в базе нет ни связей, ни пользовательских подборок — то есть после реальной потери, а не когда пользователь сам всё удалил
- Отказ от восстановления удаляет копию: иначе предложение возвращалось бы каждую сессию
- Проверка выполняется один раз за сессию (модульный флаг в `useCollectionsBackup`)
- Ручной перенос — в настройках: экспорт в файл открыт всем, импорт спрятан за режимом разработчика. Импорт только добавляет, так что «не тот файл» данные не уничтожит, но чинить последствия всё равно пришлось бы вручную

## Composables

### `useIndexDB` (composables/useIndexDB.js)
Работает с IndexedDB через `$indexedDB` из `useNuxtApp()`.

**Песни:** `addSongs(songs)` (очищает хранилище перед добавлением), `getSong(number)`, `getAllSongs()`, `getSongsCount()` (0 при ошибке), `getSongNumbers()`

**Подборки:** `createCollection(name)` → ID, `getCollections()`, `getCollection(id)`, `deleteCollection(id)` (вместе со связями)

**Связи** (везде `variantIndex = 0` по умолчанию): `addSongToCollection(collectionId, songNumber, variantIndex)` (с проверкой дубликата), `removeSongFromCollection(...)`, `getSongsInCollection(collectionId)` (сортировка по номеру), `getCollectionsForSong(songNumber)`, `getAvailableCollections(songNumber)`, `getSongsCountInCollection(collectionId)`

**Избранное:** `getFavoriteCollection()`, `isSongInFavorite(songNumber, variantIndex)`, `addToFavorite(...)`, `removeFromFavorite(...)` — обёртки над подборкой с `isFavorite: 1`; бросают ошибку, если её нет

**Копия:** `getAllLinks()` (все связи), `backupCollections()` — снимает копию подборок в localStorage. Мутации (`createCollection`, `deleteCollection`, `addSongToCollection`, `removeSongFromCollection`, `addToFavorite`, `removeFromFavorite`) обёрнуты `withBackup` и снимают копию сами; сбой копирования не срывает саму операцию.

### `useCollectionsBackup` (composables/useCollectionsBackup.js)
Пользовательская сторона копии: `checkRestorable()` (предлагать ли восстановление), `restoreFromAutoBackup()`, `dismissRestore()`, `applyBackup(backup)`, `exportToText()`, `importFromText(text)`.

Импорт **только добавляет**: существующие подборки дополняются, лишнее не удаляется. Дубликаты связей считаются пропущенными, а не ошибкой. `resetCollectionsBackupState()` сбрасывает модульное состояние в тестах.

### `useSongSearch` (composables/useSongSearch.js)
Vue-обёртка над `lib/search.js`: `buildIndex(songs, { force })`, `search(query, limit)`, реактивные `searchIndex`, `exactIndex`, `searchResults`, `searchQuery`.

**Индексы — синглтон на уровне модуля.** `searchIndex`/`exactIndex` объявлены вне фабричной функции, поэтому построение переиспользуется всеми инстансами: поле на главной и попап «Перейти к песне» индексируют 1565 песен один раз на сессию. Повторный `buildIndex` — no-op, перестроить можно через `{ force: true }` или `resetSearchIndex()`.

`searchQuery` и `searchResults` остаются локальными для каждого инстанса — иначе поле на главной и попап поделили бы ввод и выдачу.

### `useSongsCache` (composables/useSongsCache.js)
Модульный кэш песен: `loadSongs()` один раз читает `getAllSongs()` и наполняет реактивные `allSongs`, `songNumbers`, `songsMap` (карта «номер → песня» из `lib/songsIndex.js`). Конкурентные вызовы дедуплицируются через закэшированный промис; при ошибке промис сбрасывается, чтобы неудача не залипла на сессию. `invalidateSongsCache()` сбрасывает кэш — вызывается из `useSongs().fetchSongs()` после обновления базы.

Страницы главной и песни берут песни и номера отсюда, а не из `useIndexDB()` напрямую.

### `useSongs` (composables/useSongs.js)
- `fetchSongs()` — загружает `assets/songs.json` через `fetch()`, сохраняет в IndexedDB через `addSongs()` и запоминает ETag. Единая точка входа для обновления базы. После записи вызывает `invalidateSongsCache()` и `resetSearchIndex()` — кэш песен и поисковые индексы устарели. Возвращает `true/false`.

### `useAutoUpdate` (composables/useAutoUpdate.js)
Проверка обновлений базы по ETag: HEAD-запрос к `songs.json`, сравнение с сохранённым ETag, при расхождении — `settings.updateAvailable = true`. Коулдаун 30 минут (`lib/autoUpdate.js`). Применение обновления делегируется в `useSongs().fetchSongs()`.

### `useLayoutCommon` (composables/useLayoutCommon.js)
Общая логика layout'ов: скрытие навбара при скролле, wake lock, автообновление, синхронизация класса размера шрифта, запрос постоянного хранилища.

Постоянное хранилище (`lib/storagePersist.js`) запрашивается **при первом взаимодействии**, а не при загрузке: браузеры охотнее выдают флаг приложению, которым реально пользуются. Слушатели `pointerdown`/`keydown` одноразовые — повторный запрос бесполезен и может показать лишний промпт. Без флага IndexedDB остаётся best-effort, и система может освободить её вместе с подборками при нехватке места.

Отказ — нормальный сценарий, а не ошибка: desktop-Chromium без установки флаг не даёт, установленному PWA на Android выдаёт. Результат виден в блоке диагностики на `/about`.

### `useWakeLock` (composables/useWakeLock.js)
Обёртка над `lib/wakeLock.js` — не даёт экрану гаснуть, если включена настройка `keepScreenOn`.

### `useUtils` (composables/utils.js)
- `pluralize(n, one, few, many)` — русская плюрализация (1 песня, 2 песни, 5 песен). Пустая строка при `n=0`.

## Поиск

Чистые функции в `lib/search.js`: `cleanText`, `prepareSongForIndexing`, `prepareVariantsForIndexing`, `buildSearchIndex`, `performSearch`, `parseSearchRef`. Индексируется каждый вариант песни отдельно, ref формата `"number:variantIndex"`; `title` boost 10, стоп-слова отключены, последний терм запроса ищется с fuzzy `~2`.

Детали ранжирования, ограничения Lunr и разбор известных промахов — `docs/reference/search-lunr.md`.

Вспомогательные чистые функции в `lib/songsIndex.js`: `buildSongsMap`, `songNumbersFrom`, `getSongTitle`, `getVariantLabel` — выдача поиска берёт название и метку варианта из карты по номеру, а не линейным `find` по всем песням.

## Хранилище настроек (stores/settings.js)

Pinia store с `useStorage` от VueUse (персистентность в localStorage):

| Поле | Тип | Значения | По умолчанию |
|------|-----|----------|--------------|
| `fontSize` | String | `'small'`, `'medium'`, `'large'` | `'medium'` |
| `showChords` | Boolean | `true` / `false` | `false` |
| `keepScreenOn` | Boolean | `true` / `false` | `true` |
| `songsEtag` | String | ETag последней загрузки `songs.json` | `''` |
| `lastUpdateCheck` | Number | timestamp последней проверки (ms) | `0` |
| `devMode` | Boolean | режим разработчика — гейт экспериментальных функций | `false` |
| `updateAvailable` | Boolean | **не персистентно** — пересчитывается при запуске | `false` |

Действия: `setFontSize`, `setShowChords`, `setKeepScreenOn`, `setSongsEtag`, `setLastUpdateCheck`, `setDevMode`, `setUpdateAvailable`.

## Layout и навигация

`layouts/default.vue`:
- Фиксированная панель 56px сверху (`app-bar` в Tailwind), скрывается при скролле вниз, появляется при скролле вверх (порог 100px)
- Три Teleport-слота: `#navbar-left`, `#navbar-center`, `#navbar-right`
- Выдвижной сайдбар с оверлеем: ссылка на главную + список подборок с количеством песен; «Избранное» всегда первым, остальные — по дате создания; внизу «О приложении» и «Настройки»
- `provide('toggleSidebar')` и `provide('updateAvailable')` — для `NavBarHamburger` / `NavBarBack`
- `UpdateToast` — предложение обновить базу песен

Футера нет: описание и версия/сборка (`appVersion`, `appCommit`, `appBuildDate`) переехали на `/about`, где они не дублируются на каждом экране.

Страницы используют `<ClientOnly><Teleport to="#navbar-...">` для наполнения навбара.

## Страницы

### `pages/index.vue` — Главная
- `SongSearchInput`: полнотекстовый поиск и переход по номеру (лимит 7 результатов)
- Подсказки: расширенные, пока в «Избранном» пусто; в обоих вариантах последняя строка плашки — ссылка «Подробнее» на `/about`
- При пустой БД — ссылка на настройки

### `pages/song/[number].vue` — Страница песни
- Навигация предыдущая/следующая (по списку номеров из `useSongsCache`)
- `SongDisplay` — текст с табами вариантов
- Звезда «в Избранное» и секция подборок: просмотр/добавление/удаление, создание подборки со страницы песни

### `pages/settings.vue` — Настройки
- Тема (light/dark/system), размер шрифта (small/medium/large)
- «Не гасить экран» (`keepScreenOn`)
- Принудительное обновление базы данных песен
- Секция «Резервная копия подборок»: экспорт в файл `podborki-YYYY-MM-DD.json` доступен всем; **импорт закрыт `settings.devMode`** — он меняет содержимое базы, и ошибиться файлом легко. Пустая база (одно пустое «Избранное») не экспортируется — `isTrivialBackup`
- Тумблер аккордов **временно скрыт** флагом `showChordsSection`; функциональность (`settings.showChords`, `SongDisplay`) сохранена — план возврата в `docs/restore-chords-toggle.md`
- Секция «Экспериментальные функции» показывается только при `settings.devMode`; там же тумблер, которым режим выключается

### `pages/about.vue` — О приложении
- Краткое описание приложения и шпаргалка «Как пользоваться» по экранам (поиск, страница песни, избранное, подборки, настройки, установка)
- Блок версии/сборки из `useAppConfig()` (`appVersion`, `appCommit`, `appBuildDate`)
- **Режим разработчика**: 7 тапов по блоку версии включают `settings.devMode` (подсказка об остатке с 3 тапов до порога). Логика подсчёта — чистая, в `lib/devMode.js` (`registerTap`, окно сброса 2 сек); страница только отображает результат
- **Блок «Состояние хранилища»** (диагностика): песен в базе, подборок, песен в подборках, постоянное хранилище, резервная копия; версия базы и занятое место — только при `devMode`. Ошибка открытия базы из `useDbStatus()` показывается **всегда и всем**: ради неё блок и сделан — на телефоне до консоли не добраться. Строки собирает `lib/diagnostics.js`; дата форматируется вручную, а не через локаль устройства, потому что эту строку пользователь пересылает как есть

### `pages/collections/[id].vue` — Подборка
- Список песен в подборке, удаление песни из подборки
- Отдельной страницы со списком всех подборок нет — подборки открываются из сайдбара

## Отображение песни (SongDisplay)

Табы вариантов показываются, если `variants.length > 1`:
- Метки из `variant.label`; пустая заменяется кириллической буквой (а, б, в, ...)
- `activeVariantIndex` сбрасывается при смене песни
- `activeVariantBody` — computed с fallback на `song.body` для обратной совместимости

Аккорды (`{Am}` над строкой, `{_G}` инлайн) и повторы (`/.../ 2р.`) — синтаксис и правила обработки в `docs/reference/song-format.md`.

## CSS и темы

### Переменные (assets/css/main.css)
Светлая тема (`:root`):
- `--bg: #ffffff`, `--bg-secondary: #f3f4f6`, `--text: #111827`, `--text-secondary: #6b7280`
- `--border-color: #e5e7eb`, `--primary: #3b82f6`, `--danger: #ef4444`, `--chord-color: red`

Тёмная тема (`.dark`):
- `--bg: #1a1a1a`, `--bg-secondary: #2d2d2d`, `--text: #f3f4f6`, `--text-secondary: #9ca3af`
- `--border-color: #374151`, `--chord-color: orange`

TailwindCSS расширяет цвета из CSS-переменных (`tailwind.config.js`): `primary`, `danger`, `bg`, `bg-secondary`, `text`, `text-secondary`, `border-color`, `chord`. Спец-spacing: `app-bar: 56px`.

## PWA и оффлайн режим

Конфигурация в `nuxt.config.js` (модуль `@vite-pwa/nuxt`):
- `registerType: 'autoUpdate'` — автоматическое обновление Service Worker
- `periodicSyncForUpdates: 20` — проверка обновлений каждые 20 сессий
- Стратегия `NetworkFirst` для `assets/songs.json` с 30-дневным TTL (1 запись в кэше)
- `globPatterns: ['**/*.{js,css,html,png,svg,ico}']`
- Manifest: standalone, портретная ориентация, display_override: fullscreen/minimal-ui
- Установка приложения (maskable-иконки, кнопка установки) покрыта e2e-тестом `pwa-install.spec.js`

## Тестирование

### Unit (Vitest)
- Окружение `happy-dom`, `fake-indexeddb` для IndexedDB (включая `IDBKeyRange`)
- Глобальные хелперы `setupTestDB()`, `cleanupTestDB()` (`test/setup.js`); моки Nuxt и fetch — в `test/helpers/`
- Версия БД в тестах берётся из `lib/dbSchema.js` — отдельно в тестах не задаётся
- Покрытие: `lib/**/*.js`, `composables/**/*.js`, provider v8, отчёты text/json/html
- Тесты: `lib/search.test.js`, `lib/repeats.test.js`, `lib/autoUpdate.test.js`, `lib/wakeLock.test.js`, `lib/dbSchema.test.js`, `lib/dbMigrations.test.js`, `lib/devMode.test.js`, `lib/songsIndex.test.js`, `lib/storagePersist.test.js`, `lib/collectionsBackup.test.js`, `lib/diagnostics.test.js`, `composables/useSongSearch.test.js`, `composables/useIndexDB.complex.test.js`, `composables/useIndexDB.unavailable.test.js`, `composables/useSongs.test.js`, `composables/useSongsCache.test.js`, `composables/useCollectionsBackup.test.js`
- Модульные синглтоны сбрасываются в `beforeEach`: `resetSearchIndex()` в тестах поиска, `invalidateSongsCache()` в тестах кэша — иначе состояние течёт между тестами

### E2E (Playwright)
- `test/e2e/specs/` — по экранам и функциям: home, navbar, sidebar, favorites, collections, add-to-collection, settings, about, song, song-goto, search-layout, responsive, width-linear, pwa-install, backup-restore
- `test/e2e/journeys/` — сквозные сценарии: find-and-open-song, build-collection, favorite-flow, configure-settings
- `test/e2e/lib/` — селекторы (`selectors.js`), сценарные хелперы (`flows.js`), фикстуры, работа с песнями
- `test/e2e/README.md`, `PLAN.md`, `UI-TEST-CASES.md` — описание покрытия

## Деплой на GitHub Pages

1. Пуш в `main` триггерит GitHub Actions (`.github/workflows/nuxtjs.yml`)
2. Workflow: checkout → Node 20 → npm install → `npm run generate` → deploy
3. `app.baseURL` настроен на `/nuxt-songs-app/`
4. Результат: `.output/public/` деплоится на GitHub Pages
5. В Settings → Pages: Deploy from branch `gh-pages`, folder `/ (root)`

## Важные детали и подводные камни

### Источник данных — songs-data/, а не songs.json
`public/assets/songs.json` **генерируется** из `songs-data/songs/*.txt` и правится только через них. Файл пересобирается автоматически в `dev`/`build`/`generate`. Ручные правки `songs.json` затрутся при следующей сборке.

### Путь к базе данных песен
Файл лежит в `public/assets/songs.json` — этот путь важен для PWA-кэширования. Локально доступен как `/assets/songs.json`; загрузка в IndexedDB — `fetch('assets/songs.json')` в `useSongs.fetchSongs()`.

### Хеширование в URL
URL песен без хеша: `/song/115`. Использовать этот формат везде — и в dev, и в production.

### Индексация поиска
Поисковый индекс строится при `onMounted` (`SongSearchInput`) и живёт синглтоном в `useSongSearch` — второе и последующие монтирования его не перестраивают. `fetchSongs()` сбрасывает индекс и кэш песен, но смонтированные компоненты перечитают данные только при следующем монтировании: после принудительного обновления базы из настроек надёжнее перезагрузить страницу.

### Плагин IndexedDB — client-only
`plugins/indexedDB.client.js` работает только на клиенте (суффикс `.client.js`). SSR доступа к IndexedDB не имеет. `provide('indexedDB')` выполняется **до** авто-загрузки песен: `fetchSongs()` обращается к `$indexedDB`, иначе на свежей установке песни не загрузятся.

### Высота страницы — только svh и только у .layout
Высоту задаёт **единственное** правило `.layout { min-height: 100svh }` (`layouts/default.vue`). `html`, `body` и `#__nuxt` высоту не задают вовсе — фон на весь экран даёт `background-color` у `body`, браузер распространяет его на канвас даже когда `body` короче окна.

Почему `svh`: в PWA на Android системная навигация скрыта и вызывается свайпом снизу — окно уменьшается, а `vh` и проценты остаются от прежнего размера. `dvh` тоже **не помог** — проверка на устройстве показала скролл ровно на высоту появившейся навигации. `svh` — высота вьюпорта при показанном системном UI, наименьшая из возможных: от состояния навигации не зависит, поэтому переполнения не даёт. При скрытой навигации внизу остаётся полоса, закрашенная фоном `body`. Фолбэк на `vh` намеренно не задан — он и есть источник бага.

По той же причине `svh` в `max-height` выдачи поиска (`components/SongSearchInput.vue`) — иначе список вылезает за экран при показанной навигации.

Регрессию сторожит e2e «высота страницы привязана к наименьшему вьюпорту (svh), и только у .layout» (`responsive.spec.js`) — он проверяет **объявления** в CSSOM, а не поведение: в desktop-Chromium large/small/dynamic вьюпорты всегда равны окну, расхождение там не воспроизводится, и поведенческая проверка была бы зелёной и без фикса.

### meta viewport и экранная клавиатура
`interactive-widget=overlays-content` в `app.head.viewport` (`nuxt.config.js`) — клавиатура накрывает страницу, а не ужимает вьюпорт. Без этого Chrome на Android при фокусе в поиске уменьшает окно, содержимое переверстывается и на короткой странице появляется скролл. `dvh` от клавиатуры не спасает: по спецификации виртуальная клавиатура в динамический вьюпорт не входит.

Viewport задаётся **только** в `nuxt.config.js`: свой тег в `layouts/default.vue` не заменял дефолтный от Nuxt, а добавлялся к нему — в разметке оказывалось два `meta[name=viewport]`. Проверяется e2e «meta viewport: клавиатура накрывает страницу…».

### Цветовая тема
`@nuxtjs/color-mode` с `classSuffix: ''` — классы `light`/`dark` на корневом элементе. По умолчанию `system`.

### Избранное — обычная подборка
«Избранное» — запись в `collections` с `isFavorite: 1`, а не отдельное хранилище. Удалять её нельзя; при отсутствии она пересоздаётся плагином.

### Компонент SongCard.vue
Существует, но не используется ни на одной странице. Поиск и навигация используют собственную разметку.
