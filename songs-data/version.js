/**
 * Версия базы песен: ручной счётчик из `songs-data/version.txt`.
 *
 * Нужна шерингу подборок: ссылка несёт номера песен и индексы вариантов, а не
 * сам текст, поэтому получателю важно знать, из какой версии базы собрана
 * подборка. Меньшая версия у получателя означает «сначала обнови базу».
 *
 * Счётчик ручной, а не производная от содержимого: автоматический хеш менялся бы
 * от любой правки опечатки, а подборкам важны только значимые изменения — новые
 * песни, переразбивка, смена вариантов.
 *
 * CommonJS: модуль живёт в инструментах сборки, как и остальной `songs-data/`.
 */

const fs = require('fs');
const path = require('path');

/** Имя файла со счётчиком — рядом с `sections.json`. */
const VERSION_FILE = 'version.txt';

/** Версия базы, у которой счётчика ещё нет. */
const DEFAULT_VERSION = 0;

/**
 * Разбирает содержимое version.txt.
 *
 * Принимает целое неотрицательное число, окружённое любыми пробелами и
 * переводами строк (файл правят руками, и завершающий перевод строки там будет
 * почти всегда). Всё остальное — невалидно: дробные, отрицательные, пустые,
 * несколько чисел.
 *
 * Отдельно от чтения файла, чтобы разбор проверялся тестами без файловой системы.
 *
 * @param {string} raw содержимое файла
 * @returns {number|null} версия или null, если значение не годится
 */
function parseVersion(raw) {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  // Именно регулярка, а не Number(): `Number('1.0')` даёт 1, `Number('0x2')` — 2,
  // а `Number('')` — 0. Каждый такой случай прошёл бы молча и записал в базу
  // версию, которой человек не имел в виду.
  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Читает версию базы из директории с данными.
 *
 * Отсутствие файла — не ошибка: до первого инкремента базе честно
 * соответствует версия 0. А вот испорченное значение возвращается с ошибкой:
 * молча подставленный ноль означал бы, что все разосланные ссылки считают базу
 * самой старой, и получатели видели бы ложное «обновите базу».
 *
 * @param {string} dir директория с данными (`songs-data/`)
 * @returns {{version: number, error?: string}}
 */
function readVersion(dir) {
  const file = path.join(dir, VERSION_FILE);

  if (!fs.existsSync(file)) {
    return { version: DEFAULT_VERSION };
  }

  const raw = fs.readFileSync(file, 'utf8');
  const version = parseVersion(raw);

  if (version === null) {
    return {
      version: DEFAULT_VERSION,
      error: `${VERSION_FILE}: ожидалось целое неотрицательное число, получено ${JSON.stringify(raw.trim())}`
    };
  }

  return { version };
}

module.exports = { parseVersion, readVersion, VERSION_FILE, DEFAULT_VERSION };
