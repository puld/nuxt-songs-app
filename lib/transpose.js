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

/**
 * Аккорд в тексте песни: `{Am}` над строкой, `{_G}` в строке, `{2:Dm}` — только
 * во втором проходе повтора (см. `lib/chordMarkup.js`). Пометка прохода при
 * сдвиге и упрощении сохраняется: она говорит, **когда** аккорд звучит, а не
 * какой он.
 */
const MARKUP_RE = /\{(?:(\d+(?:,\d+)*):)?(_?)([^}]*)\}/g

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

/**
 * Имя ступени по классу высоты.
 *
 * `german` — немецкая (H) буквенная система: «си» — `H`, «си-бемоль» — `B`
 * без знака. Не вариант диезного/бемольного набора, а замена буквы для двух
 * конкретных ступеней; остальные десять нот `german` не задевает вовсе.
 */
export function noteName(pitch, sharp = false, german = false) {
  const p = ((pitch % OCTAVE) + OCTAVE) % OCTAVE
  if (german) {
    if (p === 10) return 'B'
    if (p === 11) return 'H'
  }
  const names = sharp ? SHARP_NAMES : FLAT_NAMES
  return names[p]
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
export function transposeChord(chord, semitones, sharp = false, german = false) {
  const parsed = parseChord(chord)
  if (!parsed) return chord
  const root = pitchOf(parsed.root)
  if (root === null) return chord

  let out = noteName(root + semitones, sharp, german) + parsed.suffix
  if (parsed.bass) {
    const bass = pitchOf(parsed.bass)
    out += '/' + (bass === null ? parsed.bass : noteName(bass + semitones, sharp, german))
  }
  return out
}

/** Первый аккорд текста — по нему песня и опознаётся как минорная или мажорная. */
export function firstChord(text) {
  MARKUP_RE.lastIndex = 0
  let m
  while ((m = MARKUP_RE.exec(String(text || '')))) {
    const parsed = parseChord(m[3])
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
 *
 * При нулевом сдвиге и выключенных диезах/немецкой нотации текст возвращается
 * как есть — ради этого раннего выхода функцию не пришлось бы звать вовсе. Но
 * принудительные диезы и немецкая нотация обязаны сработать и без сдвига:
 * иначе бемоль или «B» из исходного текста песни долежат до экрана
 * нетронутыми, пока пользователь не подберёт тональность хотя бы на полтона.
 */
export function transposeText(text, semitones, sharp = false, german = false) {
  if (!text) return text || ''
  if (!semitones && !sharp && !german) return text
  return String(text).replace(MARKUP_RE, (whole, pass, inline, chord) => {
    const moved = transposeChord(chord, semitones || 0, sharp, german)
    return `{${pass ? `${pass}:` : ''}${inline}${moved}}`
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
  return String(text).replace(MARKUP_RE, (whole, pass, inline, chord) => {
    const stripped = stripChordBass(chord)
    return stripped === chord ? whole : `{${pass ? `${pass}:` : ''}${inline}${stripped}}`
  })
}

/**
 * Обозначения, которые упрощаются в простой мажор/минор/доминантсептаккорд
 * для гитарного аккомпанемента. Список закрытый — суффиксы взяты из фактически
 * встречающихся в songs-data (см. `docs/reference/song-format.md`), а не
 * перечисляют джазовую нотацию вообще.
 *
 * Это не расчёт по терциям, а выбор конвенции: у sus-аккорда терции нет вовсе
 * (ни мажорной, ни минорной), у уменьшённого и увеличенного она есть, но
 * гармония другая. «Правильной» замены не существует — только привычная для
 * простого бренчания.
 */
const SIMPLIFY_RULES = [
  // Полу- и полностью уменьшённые септаккорды — к минорному трезвучию: и то,
  // и другое звучит «минорно», а уменьшённая квинта на гитаре без спецаппликатуры не берётся
  [/^m7\(?b5\)?$/, 'm'],
  [/^dim7?$/, 'm'],
  // Задержания снимаются целиком — без терции в аккорде и мажор, и минор были
  // бы одинаково произвольной заменой, снятие честнее подмены
  [/\(?sus4\)?/, ''],
  [/\(?sus2\)?/, ''],
  // Увеличенное трезвучие — к обычному мажорному
  [/\+/, '']
]

/**
 * Упрощает суффикс одного аккорда по `SIMPLIFY_RULES`. Суффиксы, которых нет
 * в списке (`7`, `m`, `maj7`, `9` и т.д.), не трогает — под фильтр попадают
 * только явно перечисленные сложные обозначения.
 */
export function simplifyChordSuffix(suffix) {
  let out = String(suffix || '')
  for (const [re, replacement] of SIMPLIFY_RULES) {
    out = out.replace(re, replacement)
  }
  return out
}

/**
 * Упрощает один аккорд для гитарного аккомпанемента: снимает бас (`stripChordBass`)
 * и сворачивает сложные обозначения (`simplifyChordSuffix`) до мажора, минора
 * или доминантсептаккорда.
 *
 * Бас и суффикс — разные части аккорда, но для читателя это один и тот же
 * вопрос «что реально сыграть», поэтому в приложении это один тоггл, а не два:
 * отдельный тоггл на бас существовал раньше и был снят как частный случай
 * этого — см. CLAUDE.md.
 */
export function simplifyChord(chord) {
  const stripped = stripChordBass(chord)
  const parsed = parseChord(stripped)
  if (!parsed) return chord
  const suffix = simplifyChordSuffix(parsed.suffix)
  if (suffix === parsed.suffix && stripped === chord) return chord
  return parsed.root + suffix
}

/**
 * Упрощает все аккорды размеченного текста. Разметка и пометка прохода
 * сохраняются — та же схема, что у `stripBassText`.
 */
export function simplifyChordsText(text) {
  if (!text) return text || ''
  return String(text).replace(MARKUP_RE, (whole, pass, inline, chord) => {
    const simplified = simplifyChord(chord)
    return simplified === chord ? whole : `{${pass ? `${pass}:` : ''}${inline}${simplified}}`
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
 *
 * `forceSharp` перебивает `preferSharp`, а не дополняет его — та же логика,
 * что у `sharpSpelling` в `SongDisplay.vue`: раз конвенцию всё равно
 * проигнорируют, вычислять её незачем. `german` не пересекается со знаками —
 * действует только на паре ступеней «си»/«си-бемоль» (см. `noteName`).
 */
export function songKey(text, semitones = 0, forceSharp = false, german = false) {
  const first = firstChord(text)
  if (!first) return ''
  const root = pitchOf(first.root)
  if (root === null) return ''
  const sharp = forceSharp || preferSharp(text, semitones)
  const minor = /^m(?!aj)/.test(first.suffix)
  return noteName(root + semitones, sharp, german) + (minor ? 'm' : '')
}

/** Следующее значение сдвига в пределах диапазона; за краем остаётся прежнее. */
export function stepTranspose(value, delta) {
  const next = normalizeTranspose(value) + delta
  if (next < TRANSPOSE_MIN || next > TRANSPOSE_MAX) return normalizeTranspose(value)
  return next
}
