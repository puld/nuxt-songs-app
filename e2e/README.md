# E2E тесты (Playwright)

Браузерные тесты приложения nuxt-songs-app. Тесты работают с
детерминированной фикстурой данных (независимой от реальной БД) и
проверяют реальные пользовательские сценарии в браузере.

## Структура

```
e2e/
├── lib/                          # тестовая инфраструктура
│   ├── fixtures.js               # перехват assets/songs.json → фикстура
│   ├── selectors.js              # все CSS-селекторы (единый источник правды)
│   ├── songs.js                  # тестовые песни (производны от фикстуры)
│   └── flows.js                  # переиспользуемые сценарии (openSidebar, gotoSong, ...)
├── data/
│   ├── search-cases.js           # тест-кейсы поиска (редактируемые без знания Playwright)
│   └── fixtures/
│       └── songs.fixture.json    # снимок 60 песен из реальной БД
├── specs/                        # тесты по страницам/областям приложения
│   ├── home.spec.js              # главная: поиск, инструкции
│   ├── search-layout.spec.js     # адаптивная высота dropdown
│   ├── song.spec.js              # страница песни: текст, варианты, навигация
│   ├── song-goto.spec.js         # popover «Перейти к песне»
│   ├── favorites.spec.js         # звезда избранного
│   ├── add-to-collection.spec.js # попап добавления в подборку
│   ├── collections.spec.js       # страница подборки, редактирование
│   ├── settings.spec.js          # тема, шрифт, аккорды
│   ├── sidebar.spec.js           # сайдбар
│   ├── navbar.spec.js            # навбар
│   └── responsive.spec.js        # мобильный viewport
├── journeys/                     # сквозные пользовательские сценарии
│   ├── find-and-open-song.spec.js
│   ├── build-collection.spec.js
│   ├── favorite-flow.spec.js
│   └── configure-settings.spec.js
├── PLAN.md                       # исходный план (поиск)
└── UI-TEST-CASES.md              # каталог всех тест-кейсов
```

### Принципы структуры

- **Селекторы в одном месте** (`lib/selectors.js`) — при смене класса в
  компоненте правка только в одном файле.
- **Тестовые данные независимы от БД** — фикстура `songs.fixture.json`
  перехватывается через `page.route()`, тесты не ломаются при изменении
  реального `public/assets/songs.json`.
- **`lib/songs.js` производен от фикстуры** — значения вычисляются из
  JSON, а не дублируются руками.
- **Specs по страницам** — каждый файл = область приложения; новый тест
  добавляется в соответствующий spec, а не в «общую кучу».
- **Journeys — сквозные сценарии** — объединяют несколько страниц в
  end-to-end пользовательский поток.
- **Flows — переиспользуемые шаги** — `waitForHomeReady`, `openSidebar`,
  `createCollectionFromSong` и т.д. устраняют дублирование setup-кода.

## Запуск

```bash
# Установить зависимости (один раз)
npm install
npx playwright install chromium

# Запустить все E2E тесты (автозапуск dev-сервера)
npm run test:e2e

# Запустить с UI (интерактивный режим)
npm run test:e2e:ui

# Запустить конкретный spec
npx playwright test e2e/specs/home.spec.js

# Запустить по имени теста (regex)
npx playwright test -g "повесть любви"

# Запустить только джорни
npx playwright test e2e/journeys/

# Посмотреть HTML-отчёт
npx playwright show-report
```

## Как добавить новый тест

1. **Новый тест-кейс поиска** — добавьте объект в `data/search-cases.js`
   (`searchCases`, `rankingCases` или `numberCases`). Никакого Playwright —
   только `{ query, expectedNumbers, description }`.
2. **Новый тест страницы** — найдите подходящий spec в `specs/` или создайте
   новый (`<area>.spec.js`). Импортируйте `test, expect` из `../lib/fixtures`,
   селекторы из `../lib/selectors`, flows из `../lib/flows`.
3. **Новый селектор** — добавьте в `lib/selectors.js` в соответствующий раздел.
4. **Новый сквозной сценарий** — создайте `journeys/<name>.spec.js`.
5. **Новая тестовая песня** — используйте существующую из `lib/songs.js`.
   Если нужна новая — убедитесь, что она есть в фикстуре
   `data/fixtures/songs.fixture.json` (при необходимости расширьте фикстуру).

## Обновление фикстуры

Фикстура — снимок 60 песен (1–50 + 11 мульти-вариантных) из реальной БД.
Чтобы обновить снимок (если изменились форматы или нужны другие песни):

```bash
node -e "
const data = require('./public/assets/songs.json');
const songs = data.songs || data;
const multi = [32,235,494,854,1067,1175,1188,1254,1309,1363,1455];
const subset = songs.filter(s => s.n <= 50 || multi.includes(s.n)).sort((a,b)=>a.n-b.n);
require('fs').writeFileSync('e2e/data/fixtures/songs.fixture.json', JSON.stringify({songs:subset}, null, 2));
console.log('Updated:', subset.length, 'songs');
"
```

После обновления фикстуры проверьте, что `lib/songs.js` и
`data/search-cases.js` согласованы с новыми данными, и прогоните тесты.
