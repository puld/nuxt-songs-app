#!/usr/bin/env node
/**
 * Скрипт миграции: переносит блок @meta/@end из позиции после заголовка
 * в конец файла.
 *
 * Использование:
 *   node migrate-meta.js           # обработать все файлы
 *   node migrate-meta.js 0091-0120 # диапазон
 *   node migrate-js 0091 0092      # конкретные файлы
 */

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.join(__dirname, 'songs');

function parseArgs() {
  const args = process.argv.slice(2);
  const files = [];

  if (args.length === 0) {
    return { mode: 'all' };
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
      }
    }
  }

  return { mode: 'explicit', files };
}

function migrateFile(fileName) {
  const filePath = path.join(SONGS_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;

  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  // Найти @meta и @end
  const metaStart = lines.indexOf('@meta');
  const metaEnd = lines.indexOf('@end');

  if (metaStart === -1 || metaEnd === -1) {
    return 'no-meta'; // нет мета-блока — пропускаем
  }

  // Проверяем: мета-блок уже в конце файла?
  // Если @end — предпоследняя или последняя непустая строка, то уже в конце
  const lastNonEmpty = lines.reduce((acc, l, i) => l.trim() !== '' ? i : acc, 0);
  if (metaEnd >= lastNonEmpty - 1) {
    return 'already-at-end'; // уже в конце
  }

  // Извлечь мета-блок (включая @meta и @end)
  const metaLines = lines.slice(metaStart, metaEnd + 1);

  // Удалить мета-блок и окружающие пустые строки из текущей позиции
  let before = lines.slice(0, metaStart);
  let after = lines.slice(metaEnd + 1);

  // Убрать пустую строку перед @meta (если есть) и после @end (если есть)
  // После заголовка: #N Title\n\n@meta\n...\n@end\n\n1. ...
  // Нужно убрать @meta-блок и одну пустую строку после @end
  if (before.length > 0 && before[before.length - 1].trim() === '') {
    // Пустая строка перед @meta — оставляем (это разделитель после заголовка)
  }

  if (after.length > 0 && after[0].trim() === '') {
    // Убираем пустую строку после @end (она была разделителем перед телом)
    after = after.slice(1);
  }

  // Собираем файл: заголовок + тело + пустая строка + мета-блок
  let newLines = [...before, ...after];

  // Убрать trailing пустые строки
  while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
    newLines.pop();
  }

  // Добавить пустую строку и мета-блок в конец
  newLines.push('');
  newLines.push(...metaLines);
  newLines.push(''); // trailing newline

  const newText = newLines.join('\n');
  fs.writeFileSync(filePath, newText, 'utf8');

  return 'moved';
}

const { mode, files: explicitFiles } = parseArgs();

let filesToProcess;
if (mode === 'all') {
  filesToProcess = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.txt')).sort();
} else {
  filesToProcess = explicitFiles;
}

let moved = 0;
let alreadyAtEnd = 0;
let noMeta = 0;

for (const fileName of filesToProcess) {
  const result = migrateFile(fileName);
  if (result === 'moved') {
    moved++;
    console.log(`→ songs/${fileName}`);
  } else if (result === 'already-at-end') {
    alreadyAtEnd++;
  } else {
    noMeta++;
  }
}

console.log();
console.log(`Перенесено: ${moved}, уже в конце: ${alreadyAtEnd}, без мета-блока: ${noMeta}`);
