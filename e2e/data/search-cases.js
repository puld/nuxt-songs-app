// Тест-кейсы поиска песен.
// Каждый кейс: { query, expectedNumbers, description, minExpected? }
//   query             — поисковый запрос
//   expectedNumbers   — массив номеров песен, которые ДОЛЖНЫ быть в результатах
//   description       — человекочитаемое описание кейса
//   minExpected       — (опц.) минимальное число результатов
//   expectedFirst     — (опц.) номер песни, который должен быть первым
//
// Порядок результатов не важен (кроме кейсов с expectedFirst) —
// проверяем наличие, а не ранжирование.
//
// Кейсы рассчитаны на фикстуру e2e/data/fixtures/songs.fixture.json
// (60 песен: 1–50 + мульти-вариантные). Все упомянутые номера есть в фикстуре.
// Файл редактируется без знания Playwright — достаточно знать номера песен.

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
  { query: 'благ', expectedNumbers: [5, 9, 13], description: 'точный: «благ» → песни с «благая/благодать/благую»', minExpected: 3 },

  // === Lunr: опечатки и морфология ===
  { query: 'повестб', expectedNumbers: [1], description: 'Lunr: опечатка «повестб» → песни с «повесть»' },
  { query: 'малилвы', expectedNumbers: [2], description: 'Lunr: опечатка «малилвы» → «молитвы»' },
  { query: 'блогословений', expectedNumbers: [7], description: 'Lunr: опечатка «блогословений» → «благословений»' },

  // === Комбинированные кейсы ===
  { query: 'Спаситель говори', expectedNumbers: [11], description: 'unified: «Спаситель говори» → песня 11' },
  { query: 'сердца детей', expectedNumbers: [12], description: 'unified: «сердца детей» → песня 12' },
  { query: 'радостно сладко', expectedNumbers: [17], description: 'unified: «радостно сладко» → песня 17' },
]

// Кейсы проверки ранжирования: ожидаемый номер должен быть ПЕРВЫМ в списке.
export const rankingCases = [
  { query: 'повесть', expectedFirst: 1, description: '«повесть» — точный результат выше Lunr-шума' },
  { query: 'молитвы', expectedFirst: 2, description: '«молитвы» — точный результат выше Lunr-шума' },
]

// Кейсы поиска по номеру: вводим номер → Enter → проверяем переход.
// Все номера должны присутствовать в фикстуре.
export const numberCases = [
  { number: 1, expectedTitle: 'Слушайте повесть любви в простоте' },
  { number: 2, expectedTitle: 'Вот настал молитвы час' },
  { number: 235, expectedTitle: 'Со Христом бодрее в путь пойду' },
]
