#!/usr/bin/env node
/**
 * Линтер формата .txt файлов песен
 *
 * Проверяет формат .txt файлов в songs/.
 * Возвращает код 0 если всё ОК, 1 если есть ошибки.
 *
 * Использование:
 *   node lint.js [директория]              # проверить все .txt в директории
 *   node lint.js --staged                  # проверить только staged .txt файлы
 *   node lint.js файл1.txt файл2.txt ...   # проверить конкретные файлы
 */

const fs = require('fs');
const path = require('path');
const { checkSectionsIntegrity } = require('./sections-integrity');
const { checkRepeatBalance } = require('./repeat-balance');

/**
 * Допустимые поля мета-блока
 */
const META_FIELDS = {
  meter: { allowMultiple: false },
  rhyme: { allowMultiple: false },
  note: { allowMultiple: true }
};

/**
 * Проверяет мета-блок @meta...@end в тексте песни.
 * Возвращает массив ошибок [{ line, message }].
 */
function validateMetaBlock(lines) {
  const errors = [];
  const metaStart = lines.indexOf('@meta');
  const metaEnd = lines.indexOf('@end');

  // Нет мета-блока — допустимо
  if (metaStart === -1 && metaEnd === -1) {
    return errors;
  }

  // @meta без @end
  if (metaStart !== -1 && metaEnd === -1) {
    errors.push({ line: metaStart + 1, message: '@meta без закрывающего @end' });
    return errors;
  }

  // @end без @meta
  if (metaStart === -1 && metaEnd !== -1) {
    errors.push({ line: metaEnd + 1, message: '@end без открывающего @meta' });
    return errors;
  }

  // @end перед @meta
  if (metaEnd < metaStart) {
    errors.push({ line: metaEnd + 1, message: '@end идёт до @meta' });
    errors.push({ line: metaStart + 1, message: '@meta идёт после @end' });
    return errors;
  }

  // Мета-блок пустой (сразу @meta\n@end)
  if (metaEnd === metaStart + 1) {
    errors.push({ line: metaStart + 1, message: 'Пустой мета-блок (@meta сразу за ним @end)' });
  }

  // Проверяем позицию: @meta должен быть в конце файла (после тела песни)
  // Ищем последнюю непустую строку перед @meta
  if (metaStart !== -1) {
    // @meta должен быть после хотя бы одного куплета/припева
    const beforeMeta = lines.slice(0, metaStart).join('\n');
    const hasContentBefore = /^\d+\.\s/m.test(beforeMeta) || /^Припев[:.]/im.test(beforeMeta);
    if (!hasContentBefore) {
      errors.push({ line: metaStart + 1, message: '@meta должен быть после тела песни (куплетов/припевов), а не перед ними' });
    }
  }

  // Проверяем формат полей мета-блока
  const foundFields = {};
  for (let i = 0; i < metaEnd - metaStart - 1; i++) {
    const line = lines[metaStart + 1 + i].trim();
    if (!line) {
      errors.push({ line: metaStart + 1 + i + 1, message: 'Пустая строка внутри мета-блока' });
      continue;
    }

    const fieldMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!fieldMatch) {
      errors.push({ line: metaStart + 1 + i + 1, message: `Некорректная строка в мета-блоке: "${line}". Ожидается "поле: значение"` });
      continue;
    }

    const fieldName = fieldMatch[1];
    const fieldValue = fieldMatch[2].trim();

    if (!META_FIELDS[fieldName]) {
      errors.push({ line: metaStart + 1 + i + 1, message: `Неизвестное поле "${fieldName}" в мета-блоке. Допустимые поля: ${Object.keys(META_FIELDS).join(', ')}` });
      continue;
    }

    if (!META_FIELDS[fieldName].allowMultiple && foundFields[fieldName]) {
      errors.push({ line: metaStart + 1 + i + 1, message: `Повторяющееся поле "${fieldName}" в мета-блоке` });
      continue;
    }

    if (!fieldValue) {
      errors.push({ line: metaStart + 1 + i + 1, message: `Пустое значение поля "${fieldName}"` });
    }

    foundFields[fieldName] = true;
  }

  return errors;
}

/**
 * Упрощённое разделение на варианты для линтера
 */
function splitVariantsForLint(songContent) {
  const VARIANT_BOUNDARY_REGEX = /(?:^|\n\s*\n)\(([^)]+)\)\s*(?=\d+\.|Припев[:\s])/gi;

  const matches = [...songContent.matchAll(VARIANT_BOUNDARY_REGEX)];

  if (matches.length === 0) {
    return [{ label: '', content: songContent }];
  }

  const variants = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const label = match[1];
    const contentStart = match.index + match[0].length;
    const contentEnd = i < matches.length - 1
      ? matches[i + 1].index
      : songContent.length;
    const content = songContent.substring(contentStart, contentEnd).trim();
    variants.push({ label, content });
  }

  if (matches[0].index !== 0) {
    const firstContent = songContent.substring(0, matches[0].index).trim();
    if (firstContent) {
      variants.unshift({ label: '', content: firstContent });
    }
  }

  return variants;
}

/**
 * Проверяет содержимое одного .txt файла песни (по тексту)
 * Возвращает массив ошибок [{ line, message }]
 */
function lintSongContent(text, fileName) {
  const errors = [];
  const lines = text.split('\n');

  // 1. Имя файла: должно соответствовать шаблону NNNN.txt (4 цифры)
  const fileNameMatch = fileName.match(/^(\d{4})\.txt$/);
  if (!fileNameMatch) {
    errors.push({ line: 0, message: `Имя файла должно быть NNNN.txt (4 цифры), а не "${fileName}"` });
    return errors;
  }
  const fileNumber = parseInt(fileNameMatch[1]);

  // 2. Файл не должен быть пустым
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    errors.push({ line: 0, message: 'Файл пуст' });
    return errors;
  }

  // 3. Заголовок: первая строка должна быть #N Название
  const headerLine = lines[0];
  const headerMatch = headerLine.match(/^#(\d+)\s+(.+)$/);
  if (!headerMatch) {
    errors.push({ line: 1, message: `Заголовок должен быть "#N Название", а не "${headerLine}"` });
  } else {
    const headerNumber = parseInt(headerMatch[1]);

    // Номер в заголовке должен совпадать с номером файла
    if (headerNumber !== fileNumber) {
      errors.push({ line: 1, message: `Номер в заголовке #${headerNumber} не совпадает с номером файла ${fileNumber}` });
    }
  }

  // 4. Пустая строка после заголовка
  if (lines.length > 1 && lines[1].trim() !== '') {
    errors.push({ line: 2, message: 'После заголовка должна быть пустая строка' });
  }

  // 5. Проверка мета-блока @meta...@end
  errors.push(...validateMetaBlock(lines));

  // 6. Нет пустых строк с пробелами (whitespace-only lines)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0 && lines[i].trim() === '') {
      errors.push({ line: i + 1, message: 'Строка содержит только пробелы' });
    }
  }

  // 7. Непустое содержание: файл должен содержать хотя бы один куплет или припев
  const bodyStart = (lines.length > 1 && lines[1].trim() === '') ? 2 : 1;
  const bodyLines = lines.slice(bodyStart);
  const hasVerse = bodyLines.some(l => /^\d+\.\s/.test(l.trim()));
  const hasChorus = bodyLines.some(l => /^Припев[:.]/i.test(l.trim()));
  if (!hasVerse && !hasChorus) {
    errors.push({ line: 0, message: 'Файл не содержит ни одного куплета или припева' });
  }

  // 8. Нумерация куплетов: должна быть по порядку без пропусков
  //    Проверяем в рамках каждого варианта отдельно
  const bodyText = bodyLines.join('\n');
  const variantChunks = splitVariantsForLint(bodyText);

  for (const chunk of variantChunks) {
    const verseNumbers = [];
    const bodyLinesArr = chunk.content.split('\n');
    for (const line of bodyLinesArr) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const verseMatch = trimmed.match(/^(\d+)\.\s/);
      if (verseMatch) {
        verseNumbers.push(parseInt(verseMatch[1]));
      }
    }

    // Проверяем что номера не убывают (допускаются повторы вида 3(а)., 3(б).)
    for (let i = 1; i < verseNumbers.length; i++) {
      if (verseNumbers[i] < verseNumbers[i - 1]) {
        errors.push({
          line: 0,
          message: `Куплет ${verseNumbers[i]} идёт после куплета ${verseNumbers[i - 1]} (нарушена последовательность)${chunk.label ? ` в варианте "${chunk.label}"` : ''}`
        });
      } else if (verseNumbers[i] > verseNumbers[i - 1] + 1) {
        errors.push({
          line: 0,
          message: `Пропущен куплет между ${verseNumbers[i - 1]} и ${verseNumbers[i]}${chunk.label ? ` в варианте "${chunk.label}"` : ''}`
        });
      }
    }
  }

  // 9. Варианты: метка (метка) должна быть перед куплетом или припевом
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const variantMatch = trimmed.match(/^\(([^)]+)\)$/);
    if (variantMatch) {
      // Проверяем, что за меткой следует куплет или припев (на следующей непустой строке)
      let nextNonEmpty = null;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '') {
          nextNonEmpty = lines[j].trim();
          break;
        }
      }
      if (nextNonEmpty && !/^\d+\.\s/.test(nextNonEmpty) && !/^Припев[:.]/i.test(nextNonEmpty)) {
        errors.push({
          line: i + 1,
          message: `Метка варианта "${variantMatch[1]}" не предшествует куплету или припеву`
        });
      }
    }
  }

  // 10. Баланс маркеров повтора (реприз) в строфе.
  //     Несбалансированную строфу парсер отдаёт сырым текстом: слеши и «2р.»
  //     видны на экране, но ни ошибки, ни лога нет — заметить можно только
  //     глазами на конкретной песне из полутора тысяч.
  errors.push(...checkRepeatBalance(lines));

  // Проверка заглавных букв в начале строк строфы снята (пункт 6.3 плана):
  // строчная буква может быть визуальным переносом стихотворной строки, и
  // наивное правило красит мерж ложными срабатываниями.

  return errors;
}

// ============================================================================
// Проверка целостности разделов
//
// Разделы — часть базы песен, поэтому битый `sections.json` не должен уезжать
// в main: номер-сирота исчезает из группировки на «Все песни», а песня вне
// разделов уходит в группу «Вне разделов», где её не ищут. Сборка это уже
// ловит (`parse.js`), но там проверка срабатывает поздно — в деплое и в e2e.
// Здесь она попадает в быстрый job линтера, обязательный для мержа.
//
// Проверка требует ПОЛНОГО набора песен (иначе покрытие не посчитать), поэтому
// номера берутся из всей директории songs/, а не из списка проверяемых файлов.
// ============================================================================

function lintSections(songsDir) {
  const sectionsPath = path.join(path.dirname(songsDir), 'sections.json');

  console.log();

  if (!fs.existsSync(sectionsPath)) {
    console.log(`\u2717 Файл разделов не найден: ${sectionsPath}`);
    return 1;
  }

  let sections;
  try {
    sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'))
      .map((s, i) => ({ id: i, title: s.title, song_ns: s.song_ns }));
  } catch (e) {
    console.log(`\u2717 sections.json не разбирается: ${e.message}`);
    return 1;
  }

  const songs = fs.readdirSync(songsDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => ({ n: parseInt(path.basename(f, '.txt'), 10) }));

  const errors = checkSectionsIntegrity(songs, sections);

  if (errors.length === 0) {
    console.log(`\u2713 Разделы согласованы с песнями (${sections.length} \u2192 ${songs.length})`);
    return 0;
  }

  console.log('\u2717 Разделы не согласованы с песнями (sections.json)');
  for (const error of errors) {
    console.log(`  ${error.message}`);
  }

  return errors.length;
}

// ============================================================================
// CLI
//
// Использование:
//   node lint.js [директория]              # проверить все .txt в директории
//   node lint.js --staged                  # проверить только staged .txt файлы
//   node lint.js файл1.txt файл2.txt ...   # проверить конкретные файлы
// ============================================================================

const args = process.argv.slice(2);

// Определяем режим работы и список файлов
let files = [];
let songsDir = '';
// Разделы проверяются на полном наборе песен, поэтому не при каждом прогоне:
// всегда при проверке директории (CI, ручной запуск) и в pre-commit — только
// если правится сам sections.json. Проверять их при коммите одной песни
// незачем: staged-режим существует ради скорости.
let checkSections = false;

if (args.includes('--staged')) {
  // Режим pre-commit: проверяем только staged .txt файлы
  const { execSync } = require('child_process');
  try {
    const staged = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    }).trim();
    if (staged) {
      const stagedFiles = staged.split('\n');

      files = stagedFiles
        .filter(f => f.startsWith('songs-data/songs/') && f.endsWith('.txt'))
        .map(f => path.basename(f))
        .sort();

      checkSections = stagedFiles.includes('songs-data/sections.json');
    }
  } catch (e) {
    console.error('Не удалось получить список staged файлов');
    process.exit(1);
  }
  songsDir = path.join(__dirname, 'songs');
} else if (args.length > 0 && !args[0].startsWith('-') && !fs.existsSync(path.join(args[0], 'songs'))) {
  // Аргументы выглядят как имена файлов (не директория)
  files = args.map(f => path.basename(f)).sort();
  songsDir = path.join(__dirname, 'songs');
} else {
  // По умолчанию: проверить все файлы в директории
  const inputDir = args[0] || __dirname;
  songsDir = path.join(inputDir, 'songs');
  checkSections = true;
}

if (!fs.existsSync(songsDir)) {
  console.error(`Папка не найдена: ${songsDir}`);
  process.exit(1);
}

// Если файлы не указаны явно — берём все из директории
if (files.length === 0) {
  files = fs.readdirSync(songsDir)
    .filter(f => f.endsWith('.txt'))
    .sort();
}

let totalErrors = 0;
let filesWithErrors = 0;

const totalFiles = files.length;

if (totalFiles === 0) {
  console.log('Нет .txt файлов для проверки');
  // Правка одного sections.json — как раз тот случай, когда .txt не менялись,
  // а проверять разделы обязательно.
  process.exit(checkSections && lintSections(songsDir) > 0 ? 1 : 0);
}

for (const file of files) {
  const filePath = path.join(songsDir, file);

  if (!fs.existsSync(filePath)) {
    filesWithErrors++;
    totalErrors++;
    console.log(`✗ songs/${file}`);
    console.log(`  Файл не найден: ${filePath}`);
    continue;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const errors = lintSongContent(text, file);

  if (errors.length === 0) {
    // Успешные файлы не выводим по одному — только итоговое количество
  } else {
    filesWithErrors++;
    totalErrors += errors.length;
    console.log(`✗ songs/${file}`);
    for (const err of errors) {
      if (err.line > 0) {
        console.log(`  Line ${err.line}: ${err.message}`);
      } else {
        console.log(`  ${err.message}`);
      }
    }
  }
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const okFiles = totalFiles - filesWithErrors;
console.log();
if (filesWithErrors === 0) {
  console.log(`✓ ${totalFiles} ${pluralize(totalFiles, 'файл прошёл', 'файла прошли', 'файлов прошли')} проверку`);
} else {
  if (okFiles > 0) {
    console.log(`✓ ${okFiles} ${pluralize(okFiles, 'файл прошёл', 'файла прошли', 'файлов прошли')} проверку`);
  }
  console.log(`✗ ${filesWithErrors} ${pluralize(filesWithErrors, 'файл с ошибками', 'файла с ошибками', 'файлов с ошибками')} (${totalErrors} ${pluralize(totalErrors, 'ошибка', 'ошибки', 'ошибок')})`);
}

const sectionErrors = checkSections ? lintSections(songsDir) : 0;

process.exit(filesWithErrors > 0 || sectionErrors > 0 ? 1 : 0);
