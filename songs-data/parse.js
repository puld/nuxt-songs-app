#!/usr/bin/env node
/**
 * Парсер .txt файлов песен → songs.json
 *
 * Читает songs/*.txt + sections.json → собирает songs.json
 *
 * Использование:
 *   node parse.js [входная/директория] [выходной/файл]
 *
 * По умолчанию:
 *   входная директория — songs-data/ (ищет songs/ и sections.json)
 *   выходной файл — ../public/assets/songs.json
 *
 * Пример:
 *   node parse.js
 *   node parse.js /path/to/songs-data /path/to/output.json
 */

const fs = require('fs');
const path = require('path');

const inputDir = process.argv[2] || __dirname;
const outputPath = process.argv[3] || path.join(__dirname, '../public/assets/songs.json');

// ============================================================================
// Разделение на варианты по меткам (а), (б), (вариант для сестёр) и т.д.
// ============================================================================

function splitVariants(songContent) {
  // Ищем границы вариантов: (метка) в начале строки или после пустых строк,
  // за которой следует номер куплета или Припев.
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

    let content = songContent.substring(contentStart, contentEnd).trim();
    variants.push({ label, content });
  }

  // Если первый match не в самом начале, есть контент перед первым вариантом
  if (matches[0].index !== 0) {
    const firstContent = songContent.substring(0, matches[0].index).trim();
    if (firstContent) {
      variants.unshift({ label: '', content: firstContent });
    }
  }

  return variants;
}

// ============================================================================
// Парсинг тела одного варианта песни (куплеты и припевы)
// ============================================================================

function parseSongBody(content, startId) {
  const parts = [];
  let currentPart = null;
  let nextId = startId;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const verseMatch = trimmedLine.match(/^(\d+)\.\s*(.*)/);
    const chorusMatch = trimmedLine.match(/^Припев(:|.)\s*(.*)/i);

    if (verseMatch) {
      if (currentPart) parts.push(currentPart);
      currentPart = {
        type: 'verse',
        id: nextId++,
        n: parseInt(verseMatch[1]),
        content: verseMatch[2] || ''
      };
    } else if (chorusMatch) {
      if (currentPart) parts.push(currentPart);
      const chorusNumber = parts.filter(p => p.type === 'chorus').length + 1;
      currentPart = {
        type: 'chorus',
        id: nextId++,
        n: chorusNumber,
        content: chorusMatch[2].trim()
      };
    } else {
      if (currentPart) {
        if (currentPart.content) {
          currentPart.content += '\n' + trimmedLine;
        } else {
          currentPart.content = trimmedLine;
        }
      } else {
        currentPart = {
          type: 'verse',
          id: nextId++,
          n: 1,
          content: trimmedLine
        };
      }
    }
  }

  if (currentPart) parts.push(currentPart);

  return { parts, nextId };
}

// ============================================================================
// Парсинг одного .txt файла песни
// ============================================================================

function parseSongFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  // Первая строка: #N Название
  const headerLine = lines[0];
  const headerMatch = headerLine.match(/^#(\d+)\s+(.+)$/);
  if (!headerMatch) {
    throw new Error(`Некорректный заголовок в ${filePath}: "${headerLine}"`);
  }

  const songNumber = parseInt(headerMatch[1]);
  const songTitle = headerMatch[2].trim();

  // Всё после заголовка и пустой строки — тело песни
  let bodyStart = 1;
  if (lines.length > 1 && lines[1].trim() === '') {
    bodyStart = 2;
  }
  const songContent = lines.slice(bodyStart).join('\n').trim();

  // Убираем мета-блок @meta...@end (если есть)
  const contentWithoutMeta = songContent.replace(/@meta\n[\s\S]*?\n@end\n?/, '');

  // Разделяем на варианты
  const variantChunks = splitVariants(contentWithoutMeta);

  let globalBodyId = 0;
  const variants = [];

  for (const chunk of variantChunks) {
    const variantBody = parseSongBody(chunk.content, globalBodyId);
    globalBodyId = variantBody.nextId;

    variants.push({
      label: chunk.label,
      body: variantBody.parts
    });
  }

  return {
    n: songNumber,
    title: songTitle,
    variants
  };
}

// ============================================================================
// Основная логика
// ============================================================================

function main() {
  const songsDir = path.join(inputDir, 'songs');
  const sectionsPath = path.join(inputDir, 'sections.json');

  // 1. Читаем все .txt файлы, сортируем по имени
  const files = fs.readdirSync(songsDir)
    .filter(f => f.endsWith('.txt'))
    .sort();

  console.error(`Найдено ${files.length} .txt файлов`);

  // 2. Парсим каждый файл
  const songs = [];
  for (const file of files) {
    const filePath = path.join(songsDir, file);
    try {
      const song = parseSongFile(filePath);
      song.id = songs.length; // id = порядковый индекс
      songs.push(song);
    } catch (err) {
      console.error(`Ошибка в ${file}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  // 3. Читаем секции
  let sections = [];
  if (fs.existsSync(sectionsPath)) {
    const sectionsData = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
    sections = sectionsData.map((s, i) => ({
      id: i,
      title: s.title,
      song_ns: s.song_ns
    }));
  } else {
    console.error(`Файл секций не найден: ${sectionsPath}`);
  }

  // 4. Собираем итоговый JSON
  const result = { songs, sections };

  // 5. Вывод
  const output = JSON.stringify(result, null, 2);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  console.error(`Записано в ${outputPath}`);
}

main();
