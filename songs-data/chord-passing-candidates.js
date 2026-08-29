/**
 * Прототип: выгружает кандидатов на «проходящий аккорд» — только список для
 * ручного просмотра, ничего в данных не меняет.
 *
 * Контекст: тогглы «Упростить для гитары» и «Схлопывать повтор корня» решают
 * то, что решается без разночтений (см. CLAUDE.md, «Схлопывание повтора
 * корня»). Проходящий аккорд — другой случай: `{C}...{G/B}...{Am}...` в
 * песне 3 — бас идёт по ступеням вниз (C→B→A), гармония каждый раз новая, и
 * убирать такой аккорд или нет — решение аранжировки, а не расчёт. Найти
 * САМ паттерн, однако, можно мехточно: обращение (аккорд с басом), чей бас
 * лежит на шаг между соседями, а корень не совпадает ни с одним из них.
 *
 * Что этот эвристический признак заведомо не ловит и ловить не должен:
 * — аккорды без баса (простое трезвучие посередине — не про проходящий бас);
 * — плотность «аккорд на каждую ноту мотива» без движения баса ступенями;
 * — стилистическую ценность найденного прохода (это и есть ручной просмотр).
 *
 * Разбор здесь свой, а не из `lib/transpose.js`: `lib/` — ESM для браузера,
 * `songs-data/` — CommonJS-инструменты сборки (та же причина дублирования,
 * что у `songs-data/repeat-balance.js`).
 */

const fs = require('fs');
const path = require('path');

const OCTAVE = 12;
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_RE = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;
const MARKUP_RE = /\{(?:(\d+(?:,\d+)*):)?(_?)([^}]*)\}/g;

/** Насколько далеко можно уйти за один «шаг» баса, чтобы считать его проходящим. */
const MAX_STEP = 2;

function pitchOf(letter, accidental) {
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return ((PITCH[letter] + shift) % OCTAVE + OCTAVE) % OCTAVE;
}

/**
 * Разбирает аккорд на корень и бас с их классами высоты. Суффикс (m, 7,
 * sus4…) не нужен для этого анализа и не разбирается.
 *
 * @param {string} text
 * @returns {{root: string, bass: string|null, rootPitch: number, bassPitch: number|null}|null}
 */
function parseChordLite(text) {
  const m = CHORD_RE.exec(String(text || '').trim());
  if (!m) return null;

  const [, letter, accidental, , bassLetter, bassAccidental] = m;

  return {
    root: letter + accidental,
    bass: bassLetter ? bassLetter + bassAccidental : null,
    rootPitch: pitchOf(letter, accidental),
    bassPitch: bassLetter ? pitchOf(bassLetter, bassAccidental) : null
  };
}

/** Кратчайшее расстояние между двумя классами высоты по кругу из 12 полутонов. */
function stepDistance(a, b) {
  const d = Math.abs(a - b) % OCTAVE;
  return Math.min(d, OCTAVE - d);
}

/** Нижняя реально звучащая нота аккорда: бас, если есть, иначе корень. */
function referencePitch(chord) {
  return chord.bassPitch !== null ? chord.bassPitch : chord.rootPitch;
}

/** Пустая строка (не в повторе) или общий текст пометки — ключ группировки прохода. */
function passKey(rawPass) {
  return rawPass || '';
}

/**
 * Достаёт аккорды из непрерывного куска текста в порядке появления.
 * Разметка повтора (`{2:C}`) и инлайн-флаг (`{_C}`) сохраняются как есть —
 * второй анализом не используется, первый нужен для группировки по проходу.
 */
function extractChordMarkers(text) {
  const markers = [];
  let m;
  MARKUP_RE.lastIndex = 0;

  while ((m = MARKUP_RE.exec(text))) {
    markers.push({ pass: passKey(m[1]), raw: m[3] });
  }

  return markers;
}

/**
 * Ищет кандидатов на проходящий аккорд в одном непрерывном куске текста
 * (куплет/припев — граница проведена пустой строкой ещё до вызова).
 *
 * @param {string} text
 * @returns {Array<{prev: string, chord: string, next: string}>}
 */
function findPassingCandidatesInBlock(text) {
  const markers = extractChordMarkers(text).map((marker) => ({
    ...marker,
    chord: parseChordLite(marker.raw)
  }));

  const candidates = [];

  for (let i = 1; i < markers.length - 1; i++) {
    const prev = markers[i - 1];
    const cur = markers[i];
    const next = markers[i + 1];

    if (!prev.chord || !cur.chord || !next.chord) continue;
    // Разные проходы повтора — разная гармония, даже при случайном совпадении
    if (prev.pass !== cur.pass || cur.pass !== next.pass) continue;
    // Интересует только обращение: проходящий бас — это и есть весь признак
    if (!cur.chord.bass) continue;
    // Совпадение корня с соседом — это повтор корня, другой (уже решённый) случай
    if (cur.chord.root === prev.chord.root || cur.chord.root === next.chord.root) continue;

    const curRef = referencePitch(cur.chord);
    const prevRef = referencePitch(prev.chord);
    const nextRef = referencePitch(next.chord);

    if (stepDistance(curRef, prevRef) > MAX_STEP) continue;
    if (stepDistance(curRef, nextRef) > MAX_STEP) continue;

    candidates.push({ prev: prev.raw, chord: cur.raw, next: next.raw });
  }

  return candidates;
}

/**
 * Ищет кандидатов во всём теле песни (после заголовка и `@meta`). Границы
 * куплетов/припевов/вариантов — пустая строка, как и в остальном формате.
 *
 * @param {string} bodyText
 * @returns {Array<{prev: string, chord: string, next: string}>}
 */
function findPassingCandidates(bodyText) {
  return String(bodyText || '')
    .split(/\n\s*\n/)
    .flatMap(findPassingCandidatesInBlock);
}

/**
 * Читает один файл песни и возвращает номер, название и тело без заголовка/меты.
 * Дублирует ровно то, что уже делает `parse.js` для этих же полей — не
 * импортируется оттуда, потому что `parse.js` не модуль, а сразу CLI (вызывает
 * `main()` при загрузке).
 */
function readSongBody(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  const headerMatch = lines[0].match(/^#(\d+)\s+(.+)$/);
  if (!headerMatch) return null;

  const bodyStart = lines.length > 1 && lines[1].trim() === '' ? 2 : 1;
  const body = lines.slice(bodyStart).join('\n');
  const withoutMeta = body.replace(/@meta\n[\s\S]*?\n@end\n?/, '');

  return { number: Number(headerMatch[1]), title: headerMatch[2].trim(), body: withoutMeta };
}

/**
 * Прогоняет весь каталог песен и возвращает кандидатов с привязкой к номеру
 * и названию песни. Только чтение — файлы не изменяются.
 *
 * @param {string} songsDir путь к `songs-data/songs`
 * @returns {Array<{song: number, title: string, prev: string, chord: string, next: string}>}
 */
function collectCandidates(songsDir) {
  const files = fs.readdirSync(songsDir).filter((f) => f.endsWith('.txt')).sort();
  const result = [];

  for (const file of files) {
    const parsed = readSongBody(path.join(songsDir, file));
    if (!parsed) continue;

    for (const candidate of findPassingCandidates(parsed.body)) {
      result.push({ song: parsed.number, title: parsed.title, ...candidate });
    }
  }

  return result;
}

module.exports = {
  parseChordLite,
  stepDistance,
  findPassingCandidates,
  collectCandidates
};

// CLI: `node songs-data/chord-passing-candidates.js` — печатает список и выходит.
// Только вывод, никаких изменений в songs-data/songs/*.txt.
if (require.main === module) {
  const songsDir = path.join(__dirname, 'songs');
  const candidates = collectCandidates(songsDir);
  const songsCount = new Set(candidates.map((c) => c.song)).size;

  console.log(`Кандидатов: ${candidates.length} (в ${songsCount} песнях)`);
  console.log('Ничего не изменено — только список для просмотра.\n');

  for (const c of candidates) {
    console.log(`#${c.song} ${c.title}`);
    console.log(`    ${c.prev}  →  [${c.chord}]  →  ${c.next}`);
  }
}
