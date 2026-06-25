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

  // Несуществующий номер — проверка «Песня не найдена».
  NONEXISTENT: 999999,

  // Несуществующий ID подборки — проверка «Подборка не найдена».
  NONEXISTENT_COLLECTION: 999999,
}

// Кол-во песен в фикстуре — полезно для sanity-проверок.
export const FIXTURE_SONGS_COUNT = fixture.songs.length

// Все номера песен в фикстуре (возрастающий порядок).
export const FIXTURE_SONG_NUMBERS = fixture.songs.map((s) => s.n).sort((a, b) => a - b)
