// Тестовые песни, производные от фикстуры (единственный источник истины).
//
// Фикстура: test/e2e/data/fixtures/songs.fixture.json (снимок 60 песен из реальной БД).
// Если фикстура меняется — значения здесь обновляются автоматически,
// т.к. они вычисляются из неё, а не дублируются руками.
//
// Тесты обращаются к SONGS.* и могут проверять title, метки вариантов и т.д.

import fs from 'node:fs'
import path from 'node:path'

const fixturePath = path.resolve(process.cwd(), 'test/e2e/data/fixtures/songs.fixture.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'))

/** Найти песню по номеру в фикстуре. */
const byN = (n) => fixture.songs.find((s) => s.n === n)

/** Метки вариантов песни (или [] если один вариант). */
const labelsOf = (song) => (song?.variants || []).map((v) => v.label)

/**
 * Есть ли в песне размеченные аккорды.
 *
 * Критерий повторяет `hasChords` из `lib/chordMarkup.js` — фигурная скобка в
 * тексте. Импортировать оттуда нельзя без сборки Nuxt-алиасов, а правило
 * простое настолько, что дублирование дешевле связывания.
 */
const songHasChords = (song) =>
  (song?.variants || [{ body: song?.body || [] }]).some((v) =>
    (v.body || []).some((p) => String(p.content || '').includes('{'))
  )

/** Есть ли в песне обращения — аккорды с басом (`G/B`). */
const songHasBassChords = (song) => /\{_?[A-G][#b]?[^}]*\/[A-G]/.test(JSON.stringify(song))

// Номера песен с аккордами и без них — вычисляются из фикстуры, поэтому
// пересборка снимка не требует правки тестов.
export const SONGS_WITH_CHORDS = fixture.songs.filter(songHasChords).map((s) => s.n)
export const SONGS_WITHOUT_CHORDS = fixture.songs.filter((s) => !songHasChords(s)).map((s) => s.n)

const firstWithoutChords = fixture.songs.find((s) => !songHasChords(s))
const firstWithBass = fixture.songs.find(songHasBassChords)

export const SONGS = {
  // Песня с одним вариантом — базовые тесты отображения и навигации.
  ONE: { n: byN(1).n, title: byN(1).title, labels: labelsOf(byN(1)) },

  // Вторая песня — проверка стрелки «предыдущая».
  TWO: { n: byN(2).n, title: byN(2).title, labels: labelsOf(byN(2)) },

  // Песня с вариантами (а, б) — табы и URL ?v=.
  MULTI: { n: byN(235).n, title: byN(235).title, labels: labelsOf(byN(235)) },

  // Песня с описательными метками вариантов.
  MULTI_DESCRIPTIVE: {
    n: byN(1254).n,
    title: byN(1254).title,
    labels: labelsOf(byN(1254)),
  },

  // Песня с размеченными аккордами — отрисовка надписей и подбор тональности.
  // Тональность (`key`) записана буквально, а не вычислена `lib/transpose.js`:
  // иначе тест повторял бы реализацию и не поймал бы ошибку в ней.
  CHORDS: { n: 1, title: byN(1).title, key: 'A', keyUp1: 'Bb' },

  // Песня без аккордов — метки в списке у неё быть не должно. Номер берётся из
  // фикстуры: пересобранный снимок может разметить аккордами и вторую песню.
  NO_CHORDS: { n: firstWithoutChords.n, title: firstWithoutChords.title },

  // Песня с обращениями (`G/B`) — на ней виден тумблер «без басов». Четвёртый
  // куплет добавлен ради тумблера «упростить сложные аккорды»: sus4,
  // уменьшённый, полууменьшённый (m7b5) и увеличенный — каждый требует
  // конвенционального решения, а не расчёта из терций (см. CLAUDE.md).
  CHORDS_BASS: {
    n: firstWithBass.n,
    title: firstWithBass.title,
    complexOriginal: ['Csus4', 'Ddim', 'Am7(b5)', 'G+'],
    complexSimplified: ['C', 'Dm', 'Am', 'G'],
  },

  // Песня без сложных обозначений, но с бемольным корнем первого аккорда —
  // на ней виден тумблер «диезы вместо бемолей» и немецкое «B» (си-бемоль).
  CHORDS_FLAT: { n: 7, title: byN(7).title, rootFlat: 'Bb', rootSharp: 'A#', rootGerman: 'B' },

  // Песня с натуральным «B» (си) в тексте — немецкая нотация превращает
  // его в «H», не трогая остальные аккорды.
  CHORDS_NATURAL_B: { n: 5, title: byN(5).title, chord: 'B', germanChord: 'H' },

  // Песня с повтором, аккорды которого помечены проходом (`{1:Bm}` — только
  // первый проход, `{2:C#m}` — только второй, `{A}` — оба). Такой повтор
  // разворачивается при отрисовке: первая строфа печатается дважды и без
  // маркеров, вторая — обычный повтор, со слешами и счётчиком.
  //
  // Номер строфы и аккорды записаны буквально, а не выведены из фикстуры:
  // вычислять их значило бы повторить в тесте разбор пометки из
  // `lib/chordMarkup.js` и не поймать ошибку в нём.
  CHORD_PASSES: {
    n: 21,
    title: byN(21).title,
    // Строка повтора без аккордов — по ней считаются копии
    line: 'Хочу Тебя, мой Бог,',
    passes: 2,
    firstPassChord: 'Bm',
    secondPassChord: 'C#m',
    everyPassChord: 'A',
  },

  // Несуществующий номер — проверка «Песня не найдена».
  NONEXISTENT: 999999,

  // Несуществующий ID подборки — проверка «Подборка не найдена».
  NONEXISTENT_COLLECTION: 999999,
}

// Кол-во песен в фикстуре — полезно для sanity-проверок.
export const FIXTURE_SONGS_COUNT = fixture.songs.length

// Все номера песен в фикстуре (возрастающий порядок).
export const FIXTURE_SONG_NUMBERS = fixture.songs.map((s) => s.n).sort((a, b) => a - b)

/**
 * Раздел сборника, в котором лежит песня.
 *
 * Разделы фикстуры покрывают все её песни (как и в реальном сборнике),
 * поэтому отсутствие раздела — сломанная фикстура, а не рядовой случай.
 */
export const sectionOfSong = (n) => {
  const section = fixture.sections.find((sec) => (sec.song_ns || []).includes(n))
  if (!section) throw new Error(`Песня ${n} вне разделов фикстуры`)

  return { id: section.id, title: section.title, songNumbers: section.song_ns }
}

// ID раздела, которого в фикстуре нет — проверка деградации `?section=`.
export const NONEXISTENT_SECTION = 999

// Последний раздел фикстуры — самый дальний от начала списка,
// до него без прокрутки не добраться даже при свёрнутых группах.
export const LAST_SECTION = (() => {
  const section = fixture.sections[fixture.sections.length - 1]

  return { id: section.id, title: section.title, songNumbers: section.song_ns }
})()
