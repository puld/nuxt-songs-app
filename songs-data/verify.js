#!/usr/bin/env node
/**
 * Скрипт верификации: проверяет что преобразование текста песен
 * из сплошного формата в стихотворные строфы не привело к потере
 * или искажению текста.
 *
 * Проверки:
 *   1. Сохранность текста: нормализованный текст (без пробелов/переносов)
 *      оригинала и нового файла совпадает для каждого куплета/припева
 *   2. Структура мета-блока (@meta/@end)
 *   3. Сохранность реприз (маркеры /.../ Nр.)
 *   4. Сохранность аккордов ({...})
 *
 * Использование:
 *   node verify.js [файлы или диапазон]
 *
 * Примеры:
 *   node verify.js                    # проверить все изменённые файлы (git diff)
 *   node verify.js 0091-0120          # проверить диапазон
 *   node verify.js 0091 0092 0113     # проверить конкретные файлы
 *   node verify.js --all              # проверить все файлы
 *   node verify.js --staged           # проверить только staged файлы
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SONGS_DIR = path.join(__dirname, 'songs');
const SUPPRESSIONS_FILE = path.join(__dirname, 'verify-suppressions.txt');

/** Загружает файл подавлений. Возвращает Map<num, Set<checkType>> */
function loadSuppressions() {
  const suppressions = new Map();
  if (!fs.existsSync(SUPPRESSIONS_FILE)) return suppressions;
  const text = fs.readFileSync(SUPPRESSIONS_FILE, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    const fileNum = parts[0].padStart(4, '0');
    const checkType = parts[1];
    if (!suppressions.has(fileNum)) suppressions.set(fileNum, new Set());
    suppressions.get(fileNum).add(checkType);
  }
  return suppressions;
}

// ============================================================================
// Утилиты
// ============================================================================

/** Удаляет ремарки-инструкции [текст] (не сравниваются с оригиналом) */
function stripStageDirections(text) {
  return text.replace(/\[[^\]]*\]/g, '');
}

function normalize(text) {
  return stripStageDirections(text).replace(/\s+/g, ' ').trim();
}

/** Нормализует пунктуацию: убирает лишний пробел перед знаками пунктуации (кроме тире).
 *  По методологии, пробел перед !, ?, ., ,, ;, :, ), ] можно удалять —
 *  это не считается искажением текста. */
function normalizePunctuation(text) {
  // Убираем пробел перед знаками пунктуации (кроме тире —, – и дефиса -)
  let result = text.replace(/ +([!?\.,;:)\]])/g, '$1');
  // Добавляем пробел после знаков пунктуации перед буквой (если пропущен)
  // Это исправляет опечатки оригинала вида "Другу ,А" → "Другу, А"
  result = result.replace(/([!?\.,;:)])([А-ЯЁA-Zа-яёa-z])/g, '$1 $2');
  return result;
}

/** Удаляет блок @meta/@end из текста (для поиска реприз и аккордов) */
function stripMeta(text) {
  const lines = text.split('\n');
  const metaStart = lines.indexOf('@meta');
  const metaEnd = lines.indexOf('@end');
  if (metaStart !== -1 && metaEnd !== -1 && metaEnd > metaStart) {
    return lines.filter((_, i) => i < metaStart || i > metaEnd).join('\n');
  }
  return text;
}

/** Извлекает текст песни без заголовка и мета-блока */
function extractBody(text) {
  const lines = text.split('\n');
  // Пропускаем заголовок (#N ...) и пустую строку после него
  let start = 0;
  if (lines[0] && lines[0].match(/^#\d+/)) {
    start = 1;
    if (lines[1] && lines[1].trim() === '') start = 2;
  }

  // Пропускаем мета-блок (может быть в любом месте — после заголовка или в конце)
  const metaStart = lines.indexOf('@meta');
  const metaEnd = lines.indexOf('@end');
  if (metaStart !== -1 && metaEnd !== -1 && metaEnd > metaStart) {
    // Убираем мета-блок из текста
    const filtered = lines.filter((_, i) => i < metaStart || i > metaEnd);
    // Убираем пустые строки вокруг удалённого блока
    while (filtered.length > start && filtered[start].trim() === '' && start > 0 && filtered[start - 1].trim() === '') {
      start++;
    }
    return filtered.slice(start).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return lines.slice(start).join('\n');
}

/** Разбивает тело песни на куплеты/припевы.
 *  Возвращает массив { type: 'verse'|'chorus', n: number, content: string } */
function parseParts(bodyText) {
  const parts = [];
  const lines = bodyText.split('\n');
  let currentPart = null;
  let currentLines = [];

  function flushPart() {
    if (currentPart) {
      currentPart.content = currentLines.join('\n').trim();
      if (currentPart.content) {
        parts.push(currentPart);
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Пустая строка — разделитель между частями
    if (trimmed === '') {
      flushPart();
      currentPart = null;
      currentLines = [];
      continue;
    }

    // Метка варианта
    if (trimmed.match(/^\([^)]+\)$/)) {
      flushPart();
      currentPart = null;
      currentLines = [];
      continue;
    }

    // Начало куплета
    const verseMatch = trimmed.match(/^(\d+)(\([а-яё]+\))?\.\s/);
    if (verseMatch) {
      flushPart();
      currentPart = { type: 'verse', n: parseInt(verseMatch[1]), content: '' };
      currentLines = [trimmed];
      continue;
    }

    // Начало припева
    if (trimmed.match(/^Припев[:.]/i)) {
      flushPart();
      currentPart = { type: 'chorus', n: 0, content: '' };
      currentLines = [trimmed];
      continue;
    }

    // Продолжение текущей части
    if (currentPart) {
      currentLines.push(trimmed);
    }
  }

  flushPart();
  return parts;
}

/** Извлекает все репризы из текста */
function extractRepeats(text) {
  // Нормализуем текст: схлопываем пробелы, чтобы найти репризы на нескольких строках
  const normText = text.replace(/\s+/g, ' ');
  const repeats = [];
  const regex = /\/[^/]*?\/\s*\d+\s*р\.?/g;
  let match;
  while ((match = regex.exec(normText)) !== null) {
    repeats.push(normalize(match[0]));
  }
  // Также /.../ 2р без закрывающего / (формат /текст /2р.)
  const regex2 = /\/[^/]+?\s*\/\s*\d+\s*р\.?/g;
  while ((match = regex2.exec(normText)) !== null) {
    const n = normalize(match[0]);
    if (!repeats.includes(n)) repeats.push(n);
  }
  return repeats.sort();
}

/** Извлекает все аккорды из текста */
function extractChords(text) {
  const chords = [];
  const regex = /\{[^}]+\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    chords.push(match[0]);
  }
  return chords;
}

// ============================================================================
// Верификация одного файла
// ============================================================================

function verifyFile(fileName, originalText, newText, suppressedChecks) {
  let errors = [];
  let warnings = [];
  const suppressedErrors = [];
  const suppressedWarnings = [];
  const supp = suppressedChecks || new Set();

  // Хелпер: фильтрует ошибки/предупреждения по типу подавления
  function filterBySuppression(items, checkType) {
    if (!supp.has(checkType)) return items;
    const filtered = [];
    for (const item of items) {
      // Для реприз: подавляем если сообщение содержит "Потеряна реприза" или "Кол-во реприз"
      if (checkType === 'repeat' && (item.includes('реприза') || item.includes('реприз'))) {
        suppressedErrors.push(item);
        continue;
      }
      // Для регистра: подавляем если сообщение содержит "регистр"
      if (checkType === 'case' && item.includes('регистр')) {
        suppressedWarnings.push(item);
        continue;
      }
      // Для текста: подавляем всё
      if (checkType === 'text' && item.includes('текст изменён')) {
        suppressedErrors.push(item);
        continue;
      }
      // Для пунктуации: подавляем предупреждения о пробелах перед пунктуацией
      if (checkType === 'punctuation' && (item.includes('пробел перед знаком пунктуации') || item.includes('пробел перед пунктуацией'))) {
        suppressedWarnings.push(item);
        continue;
      }
      filtered.push(item);
    }
    return filtered;
  }

  // 1. Сравнение нормализованного текста каждой части
  const origBody = extractBody(originalText);
  const newBody = extractBody(newText);

  const origParts = parseParts(origBody);
  const newParts = parseParts(newBody);

  // Сравниваем общее нормализованное тело (самая надёжная проверка)
  const origNorm = normalize(origBody);
  const newNorm = normalize(newBody);

  if (origNorm !== newNorm) {
    // Проверяем: только ли изменение регистра?
    if (origNorm.toLowerCase() === newNorm.toLowerCase()) {
      // Расхождение только в регистре — это предупреждение, не ошибка
      // (по методологии строчные в начале строки → заглавные)
      warnings.push('Изменён регистр (ожидаемо при разбиении на строфы)');
    } else if (normalizePunctuation(origNorm).toLowerCase() === normalizePunctuation(newNorm).toLowerCase()) {
      // Расхождение только в регистре и/или пробелах перед пунктуацией
      // Проверяем, есть ли расхождение в регистре
      if (normalizePunctuation(origNorm) !== normalizePunctuation(newNorm)) {
        warnings.push('Изменён регистр (ожидаемо при разбиении на строфы)');
      }
      // Если исходный и новый текст отличаются только пробелами перед пунктуацией
      if (normalizePunctuation(origNorm) === normalizePunctuation(newNorm)) {
        warnings.push('Удалён пробел перед знаком пунктуации');
      } else {
        warnings.push('Удалён пробел перед знаком пунктуации + изменён регистр');
      }
    } else {
      // Реальное расхождение текста
      // Находим конкретное расхождение
      // Сравниваем по частям
      if (origParts.length === newParts.length) {
        for (let i = 0; i < origParts.length; i++) {
          const op = normalize(origParts[i].content);
          const np = normalize(newParts[i].content);
          if (op !== np) {
            if (op.toLowerCase() === np.toLowerCase()) {
              warnings.push(`Изменён регистр в ${origParts[i].type} ${origParts[i].n}`);
            } else if (normalizePunctuation(op).toLowerCase() === normalizePunctuation(np).toLowerCase()) {
              // Расхождение только в пробелах перед пунктуацией и/или регистре
              if (normalizePunctuation(op) === normalizePunctuation(np)) {
                warnings.push(`Удалён пробел перед знаком пунктуации в ${origParts[i].type} ${origParts[i].n}`);
              } else {
                warnings.push(`Удалён пробел перед пунктуацией + изменён регистр в ${origParts[i].type} ${origParts[i].n}`);
              }
            } else {
              errors.push(`Расхождение в ${origParts[i].type} ${origParts[i].n}: текст изменён`);
              // Показываем diff слов
              const origWords = op.split(' ');
              const newWords = np.split(' ');
              const maxLen = Math.max(origWords.length, newWords.length);
              const diffs = [];
              for (let w = 0; w < maxLen; w++) {
                if (origWords[w] !== newWords[w]) {
                  diffs.push(`[${w}]: "${origWords[w] || '∅'}" → "${newWords[w] || '∅'}"`);
                }
              }
              if (diffs.length <= 5) {
                errors.push('  ' + diffs.join(', '));
              } else {
                errors.push(`  ${diffs.length} отличий (первое: ${diffs[0]})`);
              }
            }
          }
        }
      } else {
        errors.push(`Разное кол-во частей: оригинал=${origParts.length}, новый=${newParts.length}`);
        // Всё равно проверяем совпадение по общему тексту
        const origAll = origParts.map(p => normalize(p.content)).join(' ');
        const newAll = newParts.map(p => normalize(p.content)).join(' ');
        if (origAll !== newAll) {
          if (origAll.toLowerCase() === newAll.toLowerCase()) {
            warnings.push('Изменён регистр в общем тексте');
          } else if (normalizePunctuation(origAll).toLowerCase() === normalizePunctuation(newAll).toLowerCase()) {
            warnings.push('Удалён пробел перед знаком пунктуации в общем тексте');
          } else {
            errors.push('Общий нормализованный текст не совпадает — потеря или искажение текста');
          }
        }
      }
    }
  }

  // 2. Репризы (исключаем мета-блок и ремарки из поиска)
  const origRepeats = extractRepeats(stripStageDirections(stripMeta(originalText)));
  const newRepeats = extractRepeats(stripStageDirections(stripMeta(newText)));
  if (origRepeats.length !== newRepeats.length) {
    errors.push(`Кол-во реприз: было ${origRepeats.length}, стало ${newRepeats.length}`);
  }
  for (const r of origRepeats) {
    if (!newRepeats.includes(r) && !newRepeats.some(nr => nr.toLowerCase() === r.toLowerCase())) {
      errors.push(`Потеряна реприза: "${r}"`);
    } else if (!newRepeats.includes(r)) {
      // Реприза найдена, но отличается регистр (ожидаемо при разбиении на строки)
      warnings.push(`Изменён регистр в репризе: "${r}"`);
    }
  }

  // 3. Аккорды (исключаем мета-блок и ремарки из поиска)
  const origChords = extractChords(stripStageDirections(stripMeta(originalText)));
  const newChords = extractChords(stripStageDirections(stripMeta(newText)));
  if (origChords.length !== newChords.length) {
    errors.push(`Кол-во аккордов: было ${origChords.length}, стало ${newChords.length}`);
  }
  for (let i = 0; i < origChords.length; i++) {
    if (i < newChords.length && origChords[i] !== newChords[i]) {
      errors.push(`Аккорд изменён: "${origChords[i]}" → "${newChords[i]}"`);
    }
  }

  // 4. Заголовок: номер в заголовке не изменился
  const origHeader = originalText.split('\n')[0];
  const newHeader = newText.split('\n')[0];
  const origNum = origHeader.match(/^#(\d+)/);
  const newNum = newHeader.match(/^#(\d+)/);
  if (origNum && newNum && origNum[1] !== newNum[1]) {
    errors.push(`Номер в заголовке изменён: #${origNum[1]} → #${newNum[1]}`);
  }

  // 5. Мета-блок: проверяем что есть (в новом файле)
  const newLines = newText.split('\n');
  const hasMeta = newLines.includes('@meta');
  const hasEnd = newLines.includes('@end');
  if (!hasMeta && !hasEnd) {
    warnings.push('Нет мета-блока @meta/@end');
  } else if (hasMeta && !hasEnd) {
    errors.push('Мета-блок: @meta без @end');
  } else if (!hasMeta && hasEnd) {
    errors.push('Мета-блок: @end без @meta');
  }

  // Применяем подавления ко всем собранным ошибкам и предупреждениям
  // Для каждого типа подавления прогоняем оба массива
  for (const checkType of supp) {
    errors = filterBySuppression(errors, checkType);
    warnings = filterBySuppression(warnings, checkType);
  }

  return { errors, warnings, suppressedErrors, suppressedWarnings };
}

// ============================================================================
// CLI
// ============================================================================

function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only -- songs/', {
      cwd: __dirname,
      encoding: 'utf8'
    });
    return output.trim().split('\n').filter(f => f.endsWith('.txt')).map(f => path.basename(f));
  } catch {
    return [];
  }
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only -- songs/', {
      cwd: __dirname,
      encoding: 'utf8'
    });
    return output.trim().split('\n').filter(f => f.endsWith('.txt')).map(f => path.basename(f));
  } catch {
    return [];
  }
}

function getOriginalContent(fileName) {
  try {
    return execSync(`git show HEAD:songs-data/songs/${fileName}`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    });
  } catch {
    // Файл новый (не в git) — сравниваем с пустым
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const files = [];

  if (args.length === 0) {
    // По умолчанию — изменённые файлы
    return { mode: 'changed' };
  }

  if (args.includes('--all')) {
    return { mode: 'all' };
  }

  if (args.includes('--staged')) {
    return { mode: 'staged' };
  }

  for (const arg of args) {
    const rangeMatch = arg.match(/^(\d{4})-(\d{4})$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let n = start; n <= end; n++) {
        files.push(`${String(n).padStart(4, '0')}.txt`);
      }
    } else {
      const numMatch = arg.match(/^(\d{1,4})$/);
      if (numMatch) {
        files.push(`${numMatch[1].padStart(4, '0')}.txt`);
      } else if (arg.endsWith('.txt')) {
        files.push(arg);
      }
    }
  }

  return { mode: 'explicit', files };
}

function main() {
  const { mode, files: explicitFiles } = parseArgs();

  let filesToCheck;
  if (mode === 'all') {
    filesToCheck = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.txt')).sort();
  } else if (mode === 'changed') {
    filesToCheck = getChangedFiles();
  } else if (mode === 'staged') {
    filesToCheck = getStagedFiles();
  } else {
    filesToCheck = explicitFiles;
  }

  if (filesToCheck.length === 0) {
    console.log('Нет файлов для проверки');
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalSuppressed = 0;
  let filesWithErrors = 0;
  let filesWithWarnings = 0;
  let filesChecked = 0;
  let filesSkipped = 0;
  const errorDetails = [];

  const suppressions = loadSuppressions();

  for (const fileName of filesToCheck) {
    const filePath = path.join(SONGS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`⊘ songs/${fileName} — файл не найден`);
      filesSkipped++;
      continue;
    }

    const originalText = getOriginalContent(fileName);
    if (originalText === null) {
      console.log(`⊘ songs/${fileName} — нет в git (новый файл)`);
      filesSkipped++;
      continue;
    }

    const newText = fs.readFileSync(filePath, 'utf8');
    // Извлекаем номер файла для поиска подавлений
    const fileNum = fileName.replace('.txt', '');
    const fileSuppressions = suppressions.get(fileNum) || new Set();
    const result = verifyFile(fileName, originalText, newText, fileSuppressions);
    filesChecked++;

    if (result.suppressedErrors.length > 0 || result.suppressedWarnings.length > 0) {
      totalSuppressed += result.suppressedErrors.length + result.suppressedWarnings.length;
    }

    if (result.errors.length > 0) {
      filesWithErrors++;
      totalErrors += result.errors.length;
      console.log(`✗ songs/${fileName} — ${result.errors.length} ошибок`);
      for (const err of result.errors) {
        console.log(`  ${err}`);
      }
      errorDetails.push({ file: fileName, errors: result.errors });
    } else if (result.warnings.length > 0) {
      filesWithWarnings++;
      totalWarnings += result.warnings.length;
      console.log(`⚠ songs/${fileName} — ${result.warnings.length} предупреждений`);
      for (const w of result.warnings) {
        console.log(`  ${w}`);
      }
    } else {
      console.log(`✓ songs/${fileName}`);
    }
  }

  console.log();
  console.log(`Проверено: ${filesChecked}, пропущено: ${filesSkipped}`);
  if (totalSuppressed > 0) {
    console.log(`Подавлено: ${totalSuppressed} (см. verify-suppressions.txt)`);
  }
  if (filesWithErrors > 0) {
    console.log(`ОШИБКИ: ${filesWithErrors} файлов (${totalErrors} ошибок)`);
  }
  if (filesWithWarnings > 0) {
    console.log(`Предупреждения: ${filesWithWarnings} файлов (${totalWarnings} предупреждений)`);
  }
  if (filesWithErrors === 0 && filesWithWarnings === 0) {
    console.log(`Все ${filesChecked} файлов прошли верификацию`);
  }

  // Выводим список файлов с ошибками для быстрого перехода
  if (errorDetails.length > 0) {
    console.log();
    console.log('Файлы с ошибками:');
    for (const d of errorDetails) {
      console.log(`  songs/${d.file}`);
    }
  }

  process.exit(filesWithErrors > 0 ? 1 : 0);
}

main();
