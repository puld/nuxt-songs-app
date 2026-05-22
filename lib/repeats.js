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
 * Повторы НЕ разворачиваются — только подсветка в UI.
 * Маркеры / и /Nр. отображаются в тексте.
 */

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

    // Обычный текст — до следующего /
    const nextSlash = input.indexOf('/', pos)
    if (nextSlash === -1) {
      tokens.push({ type: 'text', value: input.slice(pos) })
      break
    }
    tokens.push({ type: 'text', value: input.slice(pos, nextSlash) })
    pos = nextSlash
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
 */
function buildHtml(segments, depth = 0) {
  let html = ''

  for (const seg of segments) {
    if (seg.type === 'text') {
      html += escapeHtml(seg.value)
    } else if (seg.type === 'repeat') {
      html += `<span class="repeat-marker">/</span>`
      html += `<span class="repeat${depth > 0 ? ` repeat-depth-${Math.min(depth, 3)}` : ''}">`
      html += buildHtml(seg.children, depth + 1)
      html += `</span>`
      html += `<span class="repeat-marker">/${seg.count}р.</span>`
    }
  }

  return html
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
 * НЕ разворачивает повторы — только подсветка.
 *
 * @param {string} content — текст с маркерами повторов
 * @returns {string} HTML с подсветкой повторов
 */
export function processRepeats(content) {
  if (!content) return ''
  if (!content.includes('/')) return escapeHtml(content)

  const tokens = tokenize(content)
  const segments = parseTokens(tokens)
  return buildHtml(segments)
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
