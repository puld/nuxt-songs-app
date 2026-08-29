/**
 * Обработка маркеров повторов в текстах песен.
 *
 * Синтаксис:
 *   /           — открывающий маркер повтора (один уровень)
 *   /Nр.        — закрывающий маркер повтора (закрывает один уровень)
 *   //          — два открывающих маркера подряд (два уровня вложенности)
 *
 * Варианты написания счётчика: /2р. /2р / 2р. /2 р.
 *
 * Повторы НЕ разворачиваются — только подсветка в UI. Маркеры / и /Nр.
 * отображаются в тексте.
 *
 * Исключение — повтор, внутри которого аккорды помечены номером прохода
 * (`{2:Dm}`, см. `lib/chordMarkup.js`): такой разворачивается на N копий, и
 * каждая получает аккорды своего прохода. Иначе разную гармонию проходов
 * негде было бы показать: текст-то один. Маркеры при развороте НЕ выводятся —
 * рядом с уже напечатанными копиями «/2р.» читалось бы как ещё один повтор
 * поверх раскрытого; курсив репризы остаётся, чтобы было видно происхождение
 * строк.
 */
import { chordsForPass, hasPassChords } from './chordMarkup.js'

// Регулярка для закрывающего маркера: /Nр. с вариантами пробелов
const COUNT_RE = /^\/\s*(\d+)\s*р\s*\.?/

/**
 * Токенизирует строку с маркерами повторов.
 *
 * Типы токенов:
 *   'text'  — обычный текст
 *   'open'  — / (открывающий маркер)
 *   'close' — /Nр. (закрывающий маркер со счётчиком)
 */
function tokenize(input) {
  const tokens = []
  let pos = 0

  while (pos < input.length) {
    // Аккорд — атом. В «{G/B}» слеш принадлежит басовой ноте, а не репризе:
    // без этой ветки разбор рвал аккорд пополам, и на экран уезжало
    // «{G<span class="repeat-marker">/</span>B}». Аккорд не вырезается, а
    // проходит целиком — рисует его дальше SongDisplay
    if (input[pos] === '{') {
      const chordEnd = input.indexOf('}', pos)
      if (chordEnd !== -1) {
        tokens.push({ type: 'text', value: input.slice(pos, chordEnd + 1) })
        pos = chordEnd + 1
        continue
      }
      // Скобка без пары — обычный текст: ломать строфу из-за неё не за что
    }

    // Проверяем //
    if (input[pos] === '/' && input[pos + 1] === '/') {
      // Два открывающих маркера подряд
      tokens.push({ type: 'open' })
      tokens.push({ type: 'open' })
      pos += 2
      continue
    }

    // Проверяем /Nр. (закрывающий маркер)
    if (input[pos] === '/') {
      const rest = input.slice(pos)
      const countMatch = rest.match(COUNT_RE)
      if (countMatch) {
        tokens.push({ type: 'close', count: countMatch[1] })
        pos += countMatch[0].length
        continue
      }
      // Просто / — открывающий маркер
      tokens.push({ type: 'open' })
      pos += 1
      continue
    }

    // Обычный текст — до следующего / или начала аккорда: слеш внутри «{…}»
    // должен достаться ветке аккорда, а не быть принятым за маркер.
    //
    // Скобка ищется с pos + 1, а не с pos: на pos она означает непарную «{»
    // (ветка аккорда её не взяла), и поиск с той же позиции возвращал бы pos —
    // токен пустой, курсор на месте, разбор в бесконечном цикле. Одна забытая
    // «}» в песне вешала бы вкладку намертво
    const nextSlash = input.indexOf('/', pos)
    const nextChord = input.indexOf('{', pos + 1)
    const stop = nextSlash === -1 ? nextChord
      : nextChord === -1 ? nextSlash
      : Math.min(nextSlash, nextChord)
    if (stop === -1) {
      tokens.push({ type: 'text', value: input.slice(pos) })
      break
    }
    tokens.push({ type: 'text', value: input.slice(pos, stop) })
    pos = stop
  }

  return tokens
}

/**
 * Парсит токены, сопоставляя открывающие и закрывающие маркеры через стек.
 * Возвращает дерево сегментов.
 *
 * Сегменты:
 *   { type: 'text', value: '...' }
 *   { type: 'repeat', count: '2', children: [...] }
 */
function parseTokens(tokens) {
  const segments = []
  const stack = [] // каждый уровень — массив дочерних сегментов

  for (const token of tokens) {
    if (token.type === 'open') {
      stack.push([])
      continue
    }

    if (token.type === 'close') {
      if (stack.length > 0) {
        const children = stack.pop()
        const segment = { type: 'repeat', count: token.count, children }
        if (stack.length > 0) {
          stack[stack.length - 1].push(segment)
        } else {
          segments.push(segment)
        }
      } else {
        // Нет парного открывающего — показываем маркер как текст
        segments.push({ type: 'text', value: `/${token.count}р.` })
      }
      continue
    }

    // Обычный текст
    if (token.type === 'text') {
      const target = stack.length > 0 ? stack[stack.length - 1] : segments
      target.push({ type: 'text', value: token.value })
    }
  }

  // Незакрытые маркеры — добавляем их дочерние элементы на верхний уровень
  for (const children of stack) {
    segments.push({ type: 'text', value: '/' })
    for (const child of children) {
      segments.push(child)
    }
  }

  return segments
}

/**
 * Собирает HTML из дерева сегментов.
 * Маркеры / и /Nр. отображаются, повторяемый текст выделяется.
 *
 * `expand` — разрешён ли разворот помеченных повторов. Он имеет смысл только
 * там, где видны аккорды: без них копии отличаются друг от друга ничем, и
 * строфа выглядела бы просто набранной дважды, потеряв привычные слеши.
 */
function buildHtml(segments, depth = 0, expand = true) {
  let html = ''

  for (const seg of segments) {
    if (seg.type === 'text') {
      html += escapeHtml(seg.value)
    } else if (seg.type === 'repeat') {
      html += expand && expandable(seg)
        ? expandRepeat(seg, depth)
        : plainRepeat(seg, depth, expand)
    }
  }

  return html
}

/** Обёртка повторяемого текста — общая у обычного показа и у раскрытого. */
function repeatOpen(depth) {
  return `<span class="repeat${depth > 0 ? ` repeat-depth-${Math.min(depth, 3)}` : ''}">`
}

/** Повтор как он лежит в тексте: маркеры видны, содержимое одно. */
function plainRepeat(seg, depth, expand = true) {
  return `<span class="repeat-marker">/</span>`
    + repeatOpen(depth)
    + buildHtml(seg.children, depth + 1, expand)
    + `</span>`
    + `<span class="repeat-marker">/${seg.count}р.</span>`
}

/**
 * Разворачивать ли повтор: только если аккорды его **собственных** строк
 * помечены проходом. Пометка внутри вложенного повтора относится к нему, а не к
 * внешнему, поэтому дети-повторы здесь не осматриваются — иначе внешний повтор
 * размножил бы копии внутреннего вместе со своими, и число строк на экране
 * перестало бы отвечать нотам.
 */
function expandable(seg) {
  const passes = Number(seg.count)
  if (!Number.isInteger(passes) || passes < 2) return false
  return seg.children.some((child) => child.type === 'text' && hasPassChords(child.value))
}

/**
 * Печатает содержимое повтора столько раз, сколько его поют, оставляя каждому
 * проходу его аккорды.
 *
 * Копии разделяются переносом, если фрагмент и сам многострочный, и пробелом,
 * если он — часть строки: «/Близок Господь! /2р.» на двух строках выглядело бы
 * разрывом куплета, которого в сборнике нет.
 */
function expandRepeat(seg, depth) {
  const passes = Number(seg.count)
  const multiline = seg.children.some(
    (child) => child.type === 'text' && child.value.includes('\n')
  )
  const separator = multiline ? '\n' : ' '
  const copies = []

  for (let pass = 1; pass <= passes; pass++) {
    let html = ''
    for (const child of seg.children) {
      html += child.type === 'text'
        ? escapeHtml(chordsForPass(child.value, pass))
        : buildHtml([child], depth + 1, true)
    }
    copies.push(html)
  }

  // Хвостовой пробел копии и разделитель дали бы двойной зазор: во фрагменте
  // «/Близок Господь! /2р.» пробел стоит перед закрывающим маркером, а маркера
  // на экране больше нет
  const joined = copies
    .map((html, i) => (i < copies.length - 1 ? html.replace(/\s+$/, '') : html))
    .join(separator)

  return repeatOpen(depth) + joined + `</span>`
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Обрабатывает маркеры повторов в тексте песни.
 * Заменяет /текст /Nр. на styled spans с отображением маркеров.
 *
 * Повтор разворачивается в копии только когда аккорды его строк помечены
 * проходом **и** вызывающий разрешил это через `expand` — то есть когда аккорды
 * показаны. С выключенными аккордами повтор остаётся как в тексте: слеш,
 * содержимое, слеш со счётчиком.
 *
 * @param {string} content — текст с маркерами повторов
 * @param {{ expand?: boolean }} [options] — `expand: false` запрещает разворот
 * @returns {string} HTML с подсветкой повторов
 */
export function processRepeats(content, { expand = true } = {}) {
  if (!content) return ''
  if (!content.includes('/')) return escapeHtml(content)

  const tokens = tokenize(content)
  const segments = parseTokens(tokens)
  return buildHtml(segments, 0, expand)
}

/**
 * Удаляет маркеры повторов из текста, оставляя только содержимое.
 * /текст /Nр. → текст
 *
 * @param {string} content — текст с маркерами повторов
 * @returns {string} текст без маркеров повторов
 */
export function stripRepeats(content) {
  if (!content) return ''
  if (!content.includes('/')) return content

  const tokens = tokenize(content)
  const parts = []
  const stack = []

  for (const token of tokens) {
    if (token.type === 'open') {
      stack.push(parts.length) // запоминаем позицию для обрезки пробела
      parts.push('')
      continue
    }

    if (token.type === 'close') {
      if (stack.length > 0) {
        stack.pop()
      }
      continue
    }

    if (token.type === 'text') {
      parts.push(token.value)
    }
  }

  return parts.join('').replace(/\s+/g, ' ').trim()
}
