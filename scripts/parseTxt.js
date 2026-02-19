const fs = require('fs');
const path = require('path');

// Загружаем названия песен из names.tsv
function loadSongNames() {
    const tsvPath = path.join(__dirname, '../tmp/names.tsv');
    const tsvContent = fs.readFileSync(tsvPath, 'utf8');
    const names = {};

    const lines = tsvContent.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const [number, title] = trimmedLine.split('\t');
        if (number && title) {
            names[parseInt(number)] = title;
        }
    }

    return names;
}

const songNames = loadSongNames();

function parseTxt(text) {
    const result = {
        songs: [],
        sections: []
    };

    // Разбиваем текст на строки
    const lines = text.split('\n');

    // Находим заголовки разделов
    const sectionHeaders = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Проверяем критерии заголовка раздела
        const isSongNumbered = /^\d+\.\s*\d+\./.test(line);
        const isVerseNumber = /^\d+\.\s/.test(line);
        const isChorus = /^Припев/i.test(line);
        const hasBrackets = /[()]/.test(line);
        const startsWithUppercase = /^[А-ЯA-Z]/.test(line);

        if (!isSongNumbered && !isVerseNumber && !isChorus && !hasBrackets && startsWithUppercase) {
            // Проверяем, что следующая строка начинается с номера песни
            if (i + 1 < lines.length && /^\d+\./.test(lines[i + 1].trim())) {
                sectionHeaders.push({
                    index: i,
                    title: line
                });
            }
        }
    }

    // Разбиваем текст на разделы
    for (let s = 0; s < sectionHeaders.length; s++) {
        const header = sectionHeaders[s];
        const nextHeader = sectionHeaders[s + 1];

        // Определяем границы раздела
        const startIndex = header.index + 1;
        const endIndex = nextHeader ? nextHeader.index : lines.length;

        // Извлекаем текст раздела
        const sectionLines = lines.slice(startIndex, endIndex);
        const sectionText = sectionLines.join('\n').trim();

        // Создаём объект раздела
        const section = {
            id: s,
            title: header.title,
            song_ns: []
        };

        // Находим и парсим песни в разделе
        const songStartRegex = /^(\d+)\.\s*(?:\([^)]*\))?\s+(\d+\.|Припев[:.]?)\s*([^\n]+)/gmi;
        const allMatches = [...sectionText.matchAll(songStartRegex)];

        // Фильтруем: только те, где первый элемент - номер куплета 1 или припев
        const songMatches = allMatches.filter(match => {
            const verseOrChorus = match[2];
            return verseOrChorus === '1.' || verseOrChorus === '1' || verseOrChorus.match(/^Припев/i);
        });

        for (let i = 0; i < songMatches.length; i++) {
            const songMatch = songMatches[i];
            const songNumber = parseInt(songMatch[1]);
            const verseOrChorus = songMatch[2];
            const firstLine = songMatch[3];

            // Определяем границу песни
            const currentMatchIndex = songMatch.index;
            const nextMatchIndex = i < songMatches.length - 1 ? songMatches[i+1].index : sectionText.length;
            let songContent = sectionText.substring(currentMatchIndex, nextMatchIndex).trim();

            // Удаляем номер песни из первой строки
            songContent = songContent.replace(/^\d+\.\s*/, '');

            // Парсим песню
            const song = parseSong(songContent, songNumber, firstLine, result.songs.length);

            result.songs.push(song);
            section.song_ns.push(songNumber);
        }

        result.sections.push(section);
    }

    return result;
}

// Функция парсинга отдельной песни
function parseSong(songContent, songNumber, firstLine, songId) {
    // Берём название из names.tsv, если есть, иначе используем первую строку
    const titleFromTsv = songNames[songNumber];
    const title = titleFromTsv || (firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine);

    const song = {
        id: songId,
        n: songNumber,
        title: title,
        body: []
    };

    const lines = songContent.split('\n');
    let currentPart = null;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const verseMatch = trimmedLine.match(/^(\d+)\.\s*(.*)/);
        const chorusMatch = trimmedLine.match(/^Припев(:|.)\s*(.*)/i);

        if (verseMatch) {
            if (currentPart) {
                song.body.push(currentPart);
            }
            currentPart = {
                type: 'verse',
                id: song.body.length,
                n: parseInt(verseMatch[1]),
                content: verseMatch[2] || ''
            };
        } else if (chorusMatch) {
            if (currentPart) {
                song.body.push(currentPart);
            }
            const chorusNumber = song.body.filter(p => p.type === 'chorus').length + 1;
            currentPart = {
                type: 'chorus',
                id: song.body.length,
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
                    id: 0,
                    n: 1,
                    content: trimmedLine
                };
            }
        }
    }

    if (currentPart) {
        song.body.push(currentPart);
    }

    return song;
}

// Функция для чтения файла и записи результата
function processHymnFile(inputFile, outputFile) {
    try {
        const text = fs.readFileSync(inputFile, 'utf8');
        const result = parseTxt(text);
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`Successfully parsed ${inputFile} and saved result to ${outputFile}`);

        check(result)
    } catch (err) {
        console.error('Error processing file:', err);
    }
}

// Пример использования
const inputFilePath = path.join(__dirname, '../tmp/doc.txt');
const outputFilePath = path.join(__dirname, '../tmp/result.json');

console.log('inputFilePath', inputFilePath)
console.log('outputFilePath', outputFilePath)

processHymnFile(inputFilePath, outputFilePath);

// Копируем результат в public/assets/songs.json
const targetPath = path.join(__dirname, '../public/assets/songs.json');
const result = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
fs.writeFileSync(targetPath, JSON.stringify(result, null, 2));
console.log(`Successfully copied result to ${targetPath}`);


function check(result) {

    for (const i in result.songs) {
        const song = result.songs[i]
        if ((song.n - song.id) !== 1) {
            console.log("номер ", song.n)
            return
        }
    }
}