/**
 * Проверка целостности разделов сборника.
 *
 * Разделы (`sections.json`) и песни (`songs/*.txt`) — независимые источники:
 * раздел ссылается на номер песни, но существование этого номера ничем не
 * гарантировано. Линтер проверяет формат отдельного `.txt` и про разделы не
 * знает, парсер копировал `song_ns` как есть — расхождение проходило молча:
 * номер-сирота просто исчезал из группировки на `/songs`, а песня, выпавшая
 * из разделов, уезжала в группу «Вне разделов», где её никто не ищет.
 *
 * Функции здесь чистые — принимают уже собранные массивы и ничего не читают
 * с диска и не печатают. Поля берутся в том виде, в котором они уходят в
 * `songs.json` (`song.n`, `section.song_ns`), чтобы проверялся итоговый
 * артефакт, а не промежуточное представление.
 */

/** Сколько номеров показывать в сообщении, прежде чем свернуть в «и ещё N». */
const MAX_LISTED = 10;

/** Номер песни как целое число или null, если это не номер. */
function toNumber(value) {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

/**
 * Ищет расхождения между песнями и разделами.
 *
 * @param {Array<{n: number}>} songs — песни в формате `songs.json`
 * @param {Array<{id: number, title: string, song_ns: number[]}>} sections
 * @returns {Array<{code: string, message: string}>} — пустой массив, если всё в порядке
 */
function checkSectionsIntegrity(songs, sections) {
  const existing = new Set((songs || []).map((song) => toNumber(song.n)).filter((n) => n !== null));

  const invalid = [];
  const orphans = [];
  const duplicates = [];
  // Номер → название первого раздела, в котором он встретился.
  const owner = new Map();

  (sections || []).forEach((section) => {
    const title = String(section.title || `#${section.id}`);

    (section.song_ns || []).forEach((raw) => {
      const number = toNumber(raw);

      if (number === null) {
        invalid.push(`${JSON.stringify(raw)} (раздел «${title}»)`);
        return;
      }

      if (!existing.has(number)) {
        orphans.push(`${number} (раздел «${title}»)`);
        return;
      }

      if (owner.has(number)) {
        duplicates.push(`${number} («${owner.get(number)}» и «${title}»)`);
        return;
      }

      owner.set(number, title);
    });
  });

  const uncovered = [...existing].filter((number) => !owner.has(number)).sort((a, b) => a - b);

  const errors = [];

  if (invalid.length > 0) {
    errors.push({
      code: 'invalid',
      message: `Не номер песни в song_ns: ${listNumbers(invalid)}`
    });
  }

  if (orphans.length > 0) {
    errors.push({
      code: 'orphan',
      message: `Раздел ссылается на несуществующую песню: ${listNumbers(orphans)}`
    });
  }

  if (duplicates.length > 0) {
    errors.push({
      code: 'duplicate',
      message: `Песня попала в два раздела: ${listNumbers(duplicates)}`
    });
  }

  if (uncovered.length > 0) {
    errors.push({
      code: 'uncovered',
      message: `Песня не входит ни в один раздел: ${listNumbers(uncovered)}`
    });
  }

  return errors;
}

/**
 * Перечисление для сообщения: первые `MAX_LISTED` элементов, остальные — счётчиком.
 * Без этого при регрессии в `sections.json` в консоль ушло бы полторы тысячи строк.
 */
function listNumbers(items) {
  const head = items.slice(0, MAX_LISTED).join(', ');

  return items.length > MAX_LISTED
    ? `${head} … и ещё ${items.length - MAX_LISTED}`
    : head;
}

module.exports = { checkSectionsIntegrity, listNumbers, MAX_LISTED };
