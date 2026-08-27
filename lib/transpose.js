/**
 * Транспонирование аккордов: чистые функции без Vue.
 *
 * Сдвиг хранится **в полутонах** и применяется при отрисовке: в базе текст
 * песни лежит в исходной тональности, иначе исходник портился бы необратимо и
 * разъезжался с нотами. То же значение будет двигать партитуру (фаза 9.6),
 * поэтому диапазон и разбор аккорда живут здесь, а не в компоненте.
 *
 * Диапазон −6…+5 — двенадцать тональностей, каждая ровно по разу: по кругу
 * −6 и +6 дают одно и то же, и второй край был бы дублем.
 */

/** Полутонов в октаве. */
const OCTAVE = 12

/** Наименьший сдвиг: ниже начинается повтор с другой стороны круга. */
export const TRANSPOSE_MIN = -6

/** Наибольший сдвиг. */
export const TRANSPOSE_MAX = 5

/** Класс высоты по букве. Нотация английская: `B` — си, `Bb` — си-бемоль. */
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Имена ступеней по умолчанию. Чёрные клавиши названы так, как их принято
 * записывать в тональностях с бемолями, кроме фа-диеза: `F#` привычнее `Gb`.
 */
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/** Имена для диезных тональностей: в них `A#` читается легче, чем `Bb`. */
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Тоники, при которых песня записывается диезами.
 *
 * До-диез мажор в набор не входит намеренно: у него семь диезов, а у двойника
 * ре-бемоль — пять бемолей. Иначе ля-минор на полтона вверх давал бы «A#m» —
 * написание, которого в песенниках не бывает.
 */
const SHARP_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#'])

/** Аккорд целиком: корень, суффикс, бас. Суффикс произволен — он не разбирается. */
const CHORD_RE = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/

/** Аккорд в тексте песни: `{Am}` над строкой, `{_G}` в строке. */
const MARKUP_RE = /\{(_?)([^}]*)\}/g

/**
 * Разбирает аккорд на части. Суффикс (`m`, `7`, `sus4`, `0`) не
 * интерпретируется: транспонированию он не мешает, а перечислять все
 * обозначения сборника — значит однажды не узнать очередное.
 *
 * @param {string} text
 * @returns {{root: string, suffix: string, bass: string|null}|null} null, если это не аккорд
 */
export function parseChord(text) {
  const m = CHORD_RE.exec(String(text || '').trim())
  if (!m) return null
  const [, letter, accidental, suffix, bassLetter, bassAccidental] = m
  return {
    root: letter + accidental,
    suffix,
    bass: bassLetter ? bassLetter + bassAccidental : null
  }
}

/** Класс высоты ноты (`Bb` → 10) или null. */
export function pitchOf(note) {
  const m = /^([A-G])([#b]?)$/.exec(String(note || ''))
  if (!m) return null
  const base = PITCH[m[1]]
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (base + shift + OCTAVE) % OCTAVE
}

/** Имя ступени по классу высоты. */
export function noteName(pitch, sharp = false) {
  const names = sharp ? SHARP_NAMES : FLAT_NAMES
  return names[((pitch % OCTAVE) + OCTAVE) % OCTAVE]
}

/** Приводит сдвиг к целому в диапазоне; мусор и выход за край дают 0. */
export function normalizeTranspose(value) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < TRANSPOSE_MIN || n > TRANSPOSE_MAX) return 0
  return n
}

/**
 * Транспонирует один аккорд. Нераспознанное возвращается как есть: в сборнике
 * встречаются пометки, которые аккордом не являются, и терять их нельзя.
 */
export function transposeChord(chord, semitones, sharp = false) {
  const parsed = parseChord(chord)
  if (!parsed) return chord
  const root = pitchOf(parsed.root)
  if (root === null) return chord

  let out = noteName(root + semitones, sharp) + parsed.suffix
  if (parsed.bass) {
    const bass = pitchOf(parsed.bass)
    out += '/' + (bass === null ? parsed.bass : noteName(bass + semitones, sharp))
  }
  return out
}

/** Первый аккорд текста — по нему песня и опознаётся как минорная или мажорная. */
export function firstChord(text) {
  MARKUP_RE.lastIndex = 0
  let m
  while ((m = MARKUP_RE.exec(String(text || '')))) {
    const parsed = parseChord(m[2])
    if (parsed) return parsed
  }
  return null
}

/**
 * Писать ли результат диезами. Решает **целевая** тоника, а не исходная: после
 * сдвига песня живёт в новой тональности, и знаки берутся от неё. Тоника — корень
 * первого аккорда: в сборнике песня почти всегда с неё и начинается.
 *
 * Набор один на всю песню, поэтому считается по её тексту целиком, а не по строфе:
 * иначе один куплет получил бы `Bb`, а соседний `A#`.
 */
export function preferSharp(text, semitones) {
  const first = firstChord(text)
  if (!first) return false
  const root = pitchOf(first.root)
  if (root === null) return false
  // Минор круга квинт не меняет: у ля-минора те же знаки, что у до-мажора,
  // поэтому тоника приводится к параллельному мажору
  const minor = /^m(?!aj)/.test(first.suffix)
  const key = noteName(root + semitones + (minor ? 3 : 0), false)
  return SHARP_KEYS.has(key) || SHARP_KEYS.has(noteName(root + semitones + (minor ? 3 : 0), true))
}

/**
 * Транспонирует все аккорды в размеченном тексте. Разметка сохраняется:
 * `{_G}` остаётся строчным аккордом, `{Am}` — надписью над строкой.
 */
export function transposeText(text, semitones, sharp = false) {
  if (!text || !semitones) return text || ''
  return String(text).replace(MARKUP_RE, (whole, inline, chord) => {
    const moved = transposeChord(chord, semitones, sharp)
    return `{${inline}${moved}}`
  })
}

/**
 * Убирает басовую часть аккорда: `G/B` → `G`, `D7/F#` → `D7`.
 *
 * Нераспознанное возвращается как есть — по той же причине, что и в
 * `transposeChord`: косая черта встречается не только в обращениях.
 */
export function stripChordBass(chord) {
  const parsed = parseChord(chord)
  if (!parsed || !parsed.bass) return chord
  return parsed.root + parsed.suffix
}

/**
 * Убирает бас у всех аккордов размеченного текста. Разметка сохраняется:
 * `{_G/B}` остаётся строчным аккордом.
 *
 * Отдельным проходом, а не внутри `transposeText`: сдвиг применяется всегда, а
 * упрощение — по настройке, и объединять их значило бы считать транспонирование
 * при выключенном сдвиге ради упрощения (или наоборот).
 */
export function stripBassText(text) {
  if (!text) return text || ''
  return String(text).replace(MARKUP_RE, (whole, inline, chord) => {
    const stripped = stripChordBass(chord)
    return stripped === chord ? whole : `{${inline}${stripped}}`
  })
}

/** Подпись сдвига для экрана: `+2`, `−3`, `0`. Минус типографский. */
export function formatTranspose(value) {
  const n = normalizeTranspose(value)
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`
}

/**
 * Название тональности песни после сдвига (`Am`, `F`, `F#m`) — одна функция на
 * аккорды и на будущую партитуру, чтобы экраны не считали её по-разному.
 */
export function songKey(text, semitones = 0) {
  const first = firstChord(text)
  if (!first) return ''
  const root = pitchOf(first.root)
  if (root === null) return ''
  const sharp = preferSharp(text, semitones)
  const minor = /^m(?!aj)/.test(first.suffix)
  return noteName(root + semitones, sharp) + (minor ? 'm' : '')
}

/** Следующее значение сдвига в пределах диапазона; за краем остаётся прежнее. */
export function stepTranspose(value, delta) {
  const next = normalizeTranspose(value) + delta
  if (next < TRANSPOSE_MIN || next > TRANSPOSE_MAX) return normalizeTranspose(value)
  return next
}
