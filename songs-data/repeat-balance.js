/**
 * Проверка баланса маркеров повтора (реприз) в строфе.
 *
 * Синтаксис: `/` открывает повтор, `/Nр.` — закрывает и говорит, сколько раз
 * фрагмент поётся. Каждому открывающему слешу обязан отвечать закрывающий со
 * счётчиком; `//` — два открывающих подряд (вложенные репризы с общим началом),
 * а не «двойное закрытие».
 *
 * Зачем отдельная проверка: разбор в `lib/repeats.js` устроен так, что
 * несбалансированную строфу он отдаёт **сырым текстом** — со слешами и «2р.»
 * прямо на экране. Ошибка не падает и не логируется, её видно только глазами
 * на конкретной песне из полутора тысяч. До этой проверки в сборнике так
 * сломанными лежали восемь строф.
 *
 * Порядок разбора здесь ДОЛЖЕН совпадать с `tokenize` в `lib/repeats.js`:
 * сначала `//`, потом счётчик, потом одиночный слеш. Иначе `//2р.` посчиталось
 * бы «открыл и закрыл» (баланс сходится), тогда как парсер видит два открытия
 * и ломает строфу. Дублирование правил разбора — сознательное: `lib/` — ESM
 * для браузера, `songs-data/` — CommonJS-инструменты сборки.
 */

/** Закрывающий маркер: `/2р.`, `/2р`, `/ 2 р .` — но не `/2` (см. hasCountWithoutR). */
const COUNT_RE = /^\/\s*(\d+)\s*р\s*\.?/;

/** `/2` или `/ 3` без «р» — почти наверняка забытая буква, а не открывающий слеш. */
const COUNT_WITHOUT_R_RE = /\/\s*\d+(?!\s*р)/;

/**
 * `//2р.` — самая частая ошибка в данных: выглядит как «закрыть два повтора»,
 * но у первого слеша нет счётчика, и парсер читает `//` как два ОТКРЫВАЮЩИХ.
 * Правильно — два закрывающих со своими счётчиками: `/3р. /2р.`.
 */
const DOUBLE_CLOSE_RE = /\/\/\s*\d+\s*р\s*\.?/;

/**
 * Баланс маркеров в одной строфе.
 *
 * @param {Array<{text: string, line: number}>} strophe — строки строфы с номерами в файле
 * @returns {Array<{line: number, message: string}>}
 */
function checkStropheBalance(strophe) {
  const errors = [];
  // Строки файла, на которых остались неотвеченные открывающие слеши.
  const openLines = [];

  for (const { text, line } of strophe) {
    const doubleClose = text.match(DOUBLE_CLOSE_RE);
    if (doubleClose) {
      errors.push({
        line,
        message: `"${doubleClose[0].trim()}" — у первого слеша нет счётчика; `
          + 'два закрытия пишутся раздельно: "/3р. /2р."'
      });
    }

    const suspicious = text.match(COUNT_WITHOUT_R_RE);
    if (suspicious && !doubleClose) {
      errors.push({
        line,
        message: `Счётчик повторов без «р»: "${suspicious[0]}" — нужно "${suspicious[0].trim()}р."`
      });
    }

    let pos = 0;
    while (pos < text.length) {
      if (text[pos] !== '/') {
        pos++;
        continue;
      }

      if (text.startsWith('//', pos)) {
        openLines.push(line, line);
        pos += 2;
        continue;
      }

      const count = text.slice(pos).match(COUNT_RE);
      if (count) {
        if (openLines.length === 0) {
          errors.push({
            line,
            message: `Закрывающая реприза "${count[0].trim()}" без открывающего "/"`
          });
        } else {
          openLines.pop();
        }
        pos += count[0].length;
        continue;
      }

      openLines.push(line);
      pos++;
    }
  }

  // Дисбаланс при уже названной причине — её следствие, а не отдельная ошибка:
  // повторять его значит удваивать вывод на каждой сломанной строфе.
  if (openLines.length > 0 && errors.length === 0) {
    // Сообщаем о самом раннем незакрытом — с него удобнее разбираться.
    errors.push({
      line: openLines[0],
      message: openLines.length === 1
        ? 'Незакрытая реприза: у открывающего "/" нет закрывающего "/Nр."'
        : `Незакрытые репризы: ${openLines.length} открывающих "/" без закрывающего "/Nр."`
    });
  }

  return errors;
}

/**
 * Разбивает тело песни на строфы так же, как это делает парсер: строфа
 * начинается с «N.» или «Припев:» и тянется до следующего заголовка. Пустые
 * строки внутри строфы её не обрывают — парсер их просто пропускает.
 *
 * Мета-блок исключён: в `note:` маркеры повтора упоминаются как текст.
 */
function splitStrophes(lines) {
  const strophes = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();

    if (text === '@meta') break;
    if (!text) continue;

    if (/^\d+\.\s/.test(text) || /^Припев[:.]/i.test(text)) {
      if (current) strophes.push(current);
      current = [];
    }

    if (current) current.push({ text, line: i + 1 });
  }

  if (current) strophes.push(current);

  return strophes;
}

/**
 * Проверяет маркеры повтора во всём файле песни.
 *
 * @param {string[]} lines — строки файла целиком (включая заголовок)
 * @returns {Array<{line: number, message: string}>}
 */
function checkRepeatBalance(lines) {
  return splitStrophes(lines || []).flatMap(checkStropheBalance);
}

module.exports = { checkRepeatBalance, checkStropheBalance, splitStrophes };
