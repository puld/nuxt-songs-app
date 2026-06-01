#!/usr/bin/env node
/**
 * Конвертация songs.json → отдельные .txt файлы по песням + sections.json
 *
 * Использование:
 *   node convert.js [путь/к/songs.json] [выходная/директория]
 *
 * По умолчанию:
 *   songs.json ищется в ../public/assets/songs.json
 *   выходная директория — текущая папка (songs-data/)
 *
 * Создаёт:
 *   songs/0001.txt, songs/0002.txt, ...
 *   sections.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT = path.join(__dirname, '../public/assets/songs.json');
const DEFAULT_OUTPUT_DIR = __dirname;

const inputPath = process.argv[2] || DEFAULT_INPUT;
const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

/**
 * Форматирует одну часть (куплет/припев) в текстовый формат
 */
function formatPart(part) {
  const lines = [];

  if (part.type === 'verse') {
    const contentLines = part.content.split('\n');
    // Первая строка куплета идёт после "N. "
    lines.push(`${part.n}. ${contentLines[0]}`);
    for (let i = 1; i < contentLines.length; i++) {
      lines.push(contentLines[i]);
    }
  } else if (part.type === 'chorus') {
    const contentLines = part.content.split('\n');
    lines.push('Припев:');
    for (const cl of contentLines) {
      lines.push(cl);
    }
  }

  return lines;
}

/**
 * Конвертирует одну песню в текстовый формат
 */
function songToTxt(song) {
  const lines = [];

  // Заголовок: #N Название
  lines.push(`#${song.n} ${song.title}`);
  lines.push(''); // Пустая строка после заголовка

  const variants = song.variants || [];

  if (variants.length === 1 && !variants[0].label) {
    // Единственный вариант без метки — просто части
    for (const part of variants[0].body) {
      lines.push(...formatPart(part));
      lines.push(''); // Пустая строка между частями
    }
  } else {
    // Несколько вариантов или вариант с меткой
    for (const variant of variants) {
      if (variant.label) {
        lines.push(`(${variant.label})`);
      }
      for (const part of variant.body) {
        lines.push(...formatPart(part));
        lines.push(''); // Пустая строка между частями
      }
    }
  }

  // Убираем лишние пустые строки в конце
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n') + '\n';
}

/**
 * Конвертирует секции в JSON-формат (без id — они не нужны)
 */
function sectionsToJson(sections) {
  return sections.map(s => ({
    title: s.title,
    song_ns: s.song_ns
  }));
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Файл не найден: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Чтение: ${inputPath}`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const songs = data.songs || [];
  const sections = data.sections || [];

  // Создаём папку songs/
  const songsDir = path.join(outputDir, 'songs');
  fs.mkdirSync(songsDir, { recursive: true });

  // Удаляем старые .yaml файлы если есть
  const existingFiles = fs.readdirSync(songsDir);
  for (const f of existingFiles) {
    if (f.endsWith('.yaml') || f.endsWith('.txt')) {
      fs.unlinkSync(path.join(songsDir, f));
    }
  }

  // Конвертируем каждую песню
  for (const song of songs) {
    const txtContent = songToTxt(song);
    const filename = `${String(song.n).padStart(4, '0')}.txt`;
    fs.writeFileSync(path.join(songsDir, filename), txtContent, 'utf8');
  }

  // Конвертируем секции
  const sectionsData = sectionsToJson(sections);
  fs.writeFileSync(
    path.join(outputDir, 'sections.json'),
    JSON.stringify(sectionsData, null, 2),
    'utf8'
  );

  console.log(`Конвертировано ${songs.length} песен в ${songsDir}`);
  console.log(`Секции (${sections.length}) → sections.json`);
}

main();
