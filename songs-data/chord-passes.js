/**
 * Проверка пометок прохода в аккордах: `{2:Dm}` — аккорд звучит только во
 * втором проходе охватывающего повтора, `{1,3:F}` — в первом и третьем,
 * `{Dm}` — в каждом.
 *
 * Зачем отдельная проверка: как и с балансом реприз, ошибка в пометке ничего не
 * ломает — она молча меняет смысл. `passesOf` в `lib/chordMarkup.js` выбрасывает
 * нули и нечисла, а `renderChords` показывает уцелевшую пометку как обычный
 * аккорд, поэтому `{0:F}` превращается в «звучит всегда», а `{2:Dm}` вне повтора
 * просто печатается как «Dm». Ни лога, ни падения — заметить можно только
 * глазами на конкретной песне.
 *
 * Порядок разбора здесь ДОЛЖЕН совпадать с `tokenize` в `lib/repeats.js`:
 * аккорд `{…}` — атом (слеш баса в `{G/B}` маркером не считается), затем `//`
 * (два открывающих), затем `/Nр.` (закрывающий), затем одиночный `/`. Иначе
 * проверка считала бы номер прохода относящимся не к тому повтору, что при
 * отрисовке. Дублирование правил разбора — сознательное: `lib/` — ESM для
 * браузера, `songs-data/` — CommonJS-инструменты сборки.
 *
 * Баланс маркеров тут не проверяется: закрытие без открытия и незакрытый повтор
 * — забота `repeat-balance.js`, и повторять их значило бы удваивать вывод.
 */

const { splitStrophes } = require('./repeat-balance');

/** Закрывающий маркер: `/2р.`, `/2р`, `/ 2 р .` — как в `lib/repeats.js`. */
const COUNT_RE = /^\/\s*(\d+)\s*р\s*\.?/;

/**
 * Пометка прохода внутри скобок: `2:Dm`, `1,3:F`, `2:_G`. Пометка идёт первой,
 * до `_`, — так же её разбирает `PASS` в `lib/chordMarkup.js`.
 */
const MARK_RE = /^(\d+(?:,\d+)*):/;

/** «Проход»/«Проходы» — сообщение читается вслух, и число тут всегда известно. */
function passWord(list) {
  return list.length > 1 ? `Проходы ${list.join(', ')}` : `Проход ${list[0]}`;
}

/**
 * Разбирает аккорд и либо кладёт его в кадр ближайшего повтора (там номера
 * сверятся со счётчиком, когда тот станет известен на закрытии), либо сразу
 * бракует.
 *
 * Одна ошибка на аккорд: у пометки с нулём или дублем номера сверять с
 * счётчиком уже нечего, а два сообщения об одной опечатке только шумят.
 */
function collectChord(whole, line, stack, errors) {
  const body = whole.slice(1, -1);
  const mark = body.match(MARK_RE);
  if (!mark) return;

  const numbers = mark[1].split(',').map(Number);
  const chord = body.slice(mark[0].length);

  if (stack.length === 0) {
    errors.push({
      line,
      message: `Пометка прохода вне повтора: "${whole}" — номеру не к чему `
        + `относиться; без "/…/Nр." аккорд пишется "{${chord}}"`
    });
    return;
  }

  // Ноль отсеивается молча (`passesOf` его выбрасывает), и аккорд начинает
  // звучать во всех проходах — ровно наоборот замыслу.
  const zeros = numbers.filter((n) => n < 1);
  if (zeros.length > 0) {
    errors.push({
      line,
      message: `${passWord(zeros)} в "${whole}" — проходы нумеруются с единицы; `
        + `аккорд в каждом проходе пишется "{${chord}}"`
    });
    return;
  }

  const unique = [...new Set(numbers)];
  if (unique.length !== numbers.length) {
    const dups = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
    errors.push({
      line,
      message: `${passWord(dups)} в "${whole}" повторён — каждый номер `
        + `указывается один раз: "{${unique.join(',')}:${chord}}"`
    });
    return;
  }

  stack[stack.length - 1].push({ whole, line, numbers: unique, chord });
}

/**
 * Сверяет аккорды повтора с его счётчиком. Вызывается на закрывающем маркере:
 * до него число проходов неизвестно — счётчик стоит в конце, а не в начале.
 */
function checkFrame(frame, passes) {
  const errors = [];

  for (const { whole, line, numbers, chord } of frame) {
    const tooBig = numbers.filter((n) => n > passes);
    if (tooBig.length > 0) {
      errors.push({
        line,
        message: `${passWord(tooBig)} в "${whole}" — за пределами повтора `
          + `"/${passes}р.": номера идут от 1 до ${passes}`
      });
      continue;
    }

    // Помечены все проходы разом — то же самое, что аккорд без пометки, но
    // разворачивать повтор ради этого приходится.
    if (numbers.length === passes) {
      errors.push({
        line,
        message: `"${whole}" помечает все проходы повтора "/${passes}р." — `
          + `это то же, что "{${chord}}"`
      });
    }
  }

  return errors;
}

/**
 * Пометки прохода в одной строфе.
 *
 * @param {Array<{text: string, line: number}>} strophe — строки строфы с номерами в файле
 * @returns {Array<{line: number, message: string}>}
 */
function checkStropheChordPasses(strophe) {
  const errors = [];
  // Кадры открытых повторов: аккорд попадает в верхний — ближайший охватывающий.
  const stack = [];

  for (const { text, line } of strophe) {
    let pos = 0;

    while (pos < text.length) {
      if (text[pos] === '{') {
        const end = text.indexOf('}', pos);
        if (end !== -1) {
          collectChord(text.slice(pos, end + 1), line, stack, errors);
          pos = end + 1;
          continue;
        }
        // Скобка без пары — обычный текст, парсер её тоже не выделяет
        pos++;
        continue;
      }

      if (text[pos] !== '/') {
        pos++;
        continue;
      }

      if (text.startsWith('//', pos)) {
        stack.push([], []);
        pos += 2;
        continue;
      }

      const count = text.slice(pos).match(COUNT_RE);
      if (count) {
        // Закрытие без открытия ловит проверка баланса — здесь просто нечего сверять
        const frame = stack.pop();
        if (frame) errors.push(...checkFrame(frame, Number(count[1])));
        pos += count[0].length;
        continue;
      }

      stack.push([]);
      pos++;
    }
  }

  // Аккорды незакрытого повтора остаются без счётчика: сверять не с чем, а о
  // самом повторе уже сказала проверка баланса.

  // Ошибки счётчика находятся на закрывающем маркере, то есть позже своих
  // аккордов — без сортировки вывод шёл бы не по порядку строк.
  return errors.sort((a, b) => a.line - b.line);
}

/**
 * Проверяет пометки прохода во всём файле песни.
 *
 * @param {string[]} lines — строки файла целиком (включая заголовок)
 * @returns {Array<{line: number, message: string}>}
 */
function checkChordPasses(lines) {
  return splitStrophes(lines || []).flatMap(checkStropheChordPasses);
}

module.exports = { checkChordPasses, checkStropheChordPasses };
