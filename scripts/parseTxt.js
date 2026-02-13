const fs = require('fs');
const path = require('path');

function parseTxt(text) {
    const result = {
        songs: [],
        sections: []
    };

    // Разделяем текст на разделы по строке с подчеркиваниями
    const sections = text.split(/\n_{10,}\n/);

    sections.forEach((sectionText, sectionIndex) => {
        // Извлекаем заголовок раздела (первая строка)
        const lines = sectionText.trim().split('\n');
        if (lines.length === 0) return;

        const sectionTitle = lines[0].trim();
        if (!sectionTitle) return;

        const section = {
            id: sectionIndex,
            title: sectionTitle,
            song_ns: []
        };

        // Остальной текст раздела (без заголовка)
        const songsText = lines.slice(1).join('\n').trim();

        // Находим все начала песен (строки, начинающиеся с номера песни)
        // Фильтруем, чтобы не находить строки вида "4. (текст)", где 4 - номер куплета
        const songStartRegex = /^(\d+)\.\s*(?:\([^)]*\))?\s+(\d+\.|Припев[:.]?)\s*([^\n]+)/gmi;
        const allMatches = [...songsText.matchAll(songStartRegex)];

        // Фильтруем совпадения: только те, где первый элемент - это номер куплета 1 или припев
        const songMatches = allMatches.filter(match => {
            const verseOrChorus = match[2];
            return verseOrChorus === '1.' || verseOrChorus === '1' || verseOrChorus.match(/^Припев/i);
        });

        const songs = [];
        for (let i = 0; i < songMatches.length; i++) {
            const songMatch = songMatches[i];
            const songNumber = parseInt(songMatch[1]);
            const verseOrChorus = songMatch[2];
            const verseNumber = parseInt(verseOrChorus);
            const chorusMatch = verseOrChorus.match(/^Припев/i);
            const firstLine = songMatch[3];

            // Определяем границу песни (от текущего совпадения до следующего)
            const currentMatchIndex = songMatch.index;
            const nextMatchIndex = i < songMatches.length - 1 ? songMatches[i+1].index : songsText.length;
            let songContent = songsText.substring(currentMatchIndex, nextMatchIndex).trim();

            // Удаляем номер песни из первой строки (включая текст в скобках)
            songContent = songContent.replace(/^\d+\.\s*(?:\([^)]*\))?\s+/, '');

            songs.push({
                n: songNumber,
                firstLine: firstLine,
                content: songContent
            });
        }

        // Парсим каждую песню
        songs.forEach((songData) => {
            const song = {
                id: result.songs.length,
                n: songData.n,
                title: songData.firstLine.length > 50
                    ? songData.firstLine.substring(0, 50) + '...'
                    : songData.firstLine,
                body: []
            };

            // Разделяем на строки и обрабатываем
            const lines = songData.content.split('\n');
            let currentPart = null;

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                // Проверяем начало нового куплета
                const verseMatch = trimmedLine.match(/^(\d+)\.\s*/);
                // Проверяем начало припева
                const chorusMatch = trimmedLine.match(/^Припев(:|.)\s*(.*)/i);

                if (verseMatch) {
                    // Сохраняем предыдущую часть, если есть
                    if (currentPart) {
                        song.body.push(currentPart);
                    }

                    // Начинаем новый куплет
                    currentPart = {
                        type: 'verse',
                        id: song.body.length,
                        n: parseInt(verseMatch[1]),
                        content: verseMatch[2] || ''
                    };
                } else if (chorusMatch) {
                    // Сохраняем предыдущую часть, если есть
                    if (currentPart) {
                        song.body.push(currentPart);
                    }

                    // Начинаем новый припев
                    const chorusNumber = song.body.filter(p => p.type === 'chorus').length + 1;
                    currentPart = {
                        type: 'chorus',
                        id: song.body.length,
                        n: chorusNumber,
                        content: chorusMatch[2].trim()
                    };
                } else {
                    // Продолжаем текущую часть
                    if (currentPart) {
                        if (currentPart.content) {
                            currentPart.content += '\n' + trimmedLine;
                        } else {
                            currentPart.content = trimmedLine;
                        }
                    } else {
                        // Если нет текущей части (может быть в начале песни)
                        currentPart = {
                            type: 'verse',
                            id: 0,
                            n: 1,
                            content: trimmedLine
                        };
                    }
                }
            }

            // Добавляем последнюю часть
            if (currentPart) {
                song.body.push(currentPart);
            }

            result.songs.push(song);
            section.song_ns.push(song.n);
        });

        result.sections.push(section);
    });

    return result;
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


function check(result) {

    for (const i in result.songs) {
        const song = result.songs[i]
        if ((song.n - song.id) !== 1) {
            console.log("номер ", song.n)
            return
        }
    }
}