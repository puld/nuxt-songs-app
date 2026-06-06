import { describe, it, expect } from 'vitest'
import { processRepeats, stripRepeats } from './repeats'

describe('processRepeats', () => {
  it('возвращает пустую строку для пустого ввода', () => {
    expect(processRepeats('')).toBe('')
    expect(processRepeats(null)).toBe('')
    expect(processRepeats(undefined)).toBe('')
  })

  it('не меняет текст без маркеров повторов', () => {
    expect(processRepeats('Обычный текст песни')).toBe('Обычный текст песни')
  })

  it('экранирует HTML в тексте', () => {
    expect(processRepeats('Текст <b>жирный</b>')).toBe('Текст &lt;b&gt;жирный&lt;/b&gt;')
  })

  // Паттерн A: /фрагмент /Nр. в конце строки (самый частый)
  it('обрабатывает повтор фразы в конце строки', () => {
    const result = processRepeats('/Твою волю во всём исполнять. /2р.')
    expect(result).toContain('<span class="repeat-marker">/</span>')
    expect(result).toContain('<span class="repeat">Твою волю во всём исполнять. </span>')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  // Паттерн B: /фрагмент /Nр. продолжение
  it('обрабатывает повтор фразы с продолжением после', () => {
    const result = processRepeats('/Дай слово им Твоё принять /2р. и мир вкусить святой опять.')
    expect(result).toContain('<span class="repeat">Дай слово им Твоё принять </span>')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
    expect(result).toContain('и мир вкусить святой опять.')
  })

  // Паттерн C: /фрагмент /Nр. в начале строки
  it('обрабатывает повтор фразы в начале строки', () => {
    const result = processRepeats('/Ближе /2р. к Твоему кресту')
    expect(result).toContain('<span class="repeat">Ближе </span>')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
    expect(result).toContain('к Твоему кресту')
  })

  // Весь текст — повтор
  it('обрабатывает повтор всей фразы', () => {
    const result = processRepeats('/Мой грех великий отпусти! О Господи, прости! Прости! /2р.')
    expect(result).toContain('<span class="repeat">')
    expect(result).toContain('Мой грех великий отпусти!')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  // Множественные повторы на одной строке
  it('обрабатывает два повтора на одной строке', () => {
    const result = processRepeats('/Счастье детям /2р. /Он желает дать. /3р.')
    expect(result).toContain('<span class="repeat">Счастье детям </span>')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
    expect(result).toContain('<span class="repeat">Он желает дать. </span>')
    expect(result).toContain('<span class="repeat-marker">/3р.</span>')
  })

  // // — два открывающих маркера (два уровня вложенности)
  it('обрабатывает // как два открывающих маркера', () => {
    const result = processRepeats('//О Иисус мой! /2р. За меня Ты Кровь пролил. /2р.')
    // Первый уровень: / За меня Ты Кровь пролил. /2р.
    // Второй уровень: // весь фрагмент /2р.
    expect(result).toContain('О Иисус мой!')
    expect(result).toContain('За меня Ты Кровь пролил.')
    // Два repeat-marker для открывающих
    const openMarkers = result.match(/<span class="repeat-marker">\/<\/span>/g)
    expect(openMarkers.length).toBe(2)
    // Два repeat-marker для закрывающих
    const closeMarkers = result.match(/<span class="repeat-marker">\/\d+р\.<\/span>/g)
    expect(closeMarkers.length).toBe(2)
  })

  // Вложенные повторы: //текст /3р. текст /2р.
  it('обрабатывает вложенные повторы с //', () => {
    const result = processRepeats('//В Небесах, /2р. Отчизна моя в Небесах. /2р.')
    expect(result).toContain('В Небесах,')
    expect(result).toContain('Отчизна моя в Небесах.')
  })

  // Глубокая вложенность: repeat-depth классы
  it('добавляет repeat-depth класс для вложенных повторов', () => {
    const result = processRepeats('//текст /2р. текст /2р.')
    expect(result).toContain('repeat-depth-1')
  })

  // Варианты написания счётчика
  it('обрабатывает /2р без точки', () => {
    const result = processRepeats('/текст /2р')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  it('обрабатывает / 2р. с пробелом после слеша', () => {
    const result = processRepeats('/текст / 2р.')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  it('обрабатывает /2 р. с пробелом перед р', () => {
    const result = processRepeats('/текст /2 р.')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  // Текст до и после повторов
  it('сохраняет текст до и после маркеров', () => {
    const result = processRepeats('Начало /середина /2р. конец')
    expect(result).toContain('Начало ')
    expect(result).toContain('середина ')
    expect(result).toContain(' конец')
  })

  // Непарный закрывающий маркер
  it('показывает непарный закрывающий маркер как текст', () => {
    const result = processRepeats('Текст /2р. без открывающего')
    expect(result).toContain('/2р.')
    expect(result).toContain('без открывающего')
    expect(result).not.toContain('<span class="repeat">')
  })

  // Непарный открывающий маркер
  it('обрабатывает непарный открывающий маркер', () => {
    const result = processRepeats('/текст без закрывающего')
    expect(result).toContain('текст без закрывающего')
  })

  // /4р. /5р. /6р.
  it('обрабатывает повтор 4 раза', () => {
    const result = processRepeats('/«О приди!» /4р. Призыв радостный')
    expect(result).toContain('<span class="repeat-marker">/4р.</span>')
    expect(result).toContain('Призыв радостный')
  })

  it('обрабатывает повтор 6 раз', () => {
    const result = processRepeats('//Аллилуйя! /6р. /2р.')
    expect(result).toContain('<span class="repeat-marker">/6р.</span>')
    expect(result).toContain('<span class="repeat-marker">/2р.</span>')
  })

  // Реальный пример: песня #488
  it('обрабатывает 4 повтора на одной строке (песня #488)', () => {
    const result = processRepeats('/Счастье детям /2р. /Он желает дать. /3р. /Божью волю /2р. /Будем исполнять. /3р.')
    const openCount = (result.match(/<span class="repeat-marker">\/<\/span>/g) || []).length
    const closeCount = (result.match(/<span class="repeat-marker">\/\d+р\.<\/span>/g) || []).length
    expect(openCount).toBe(4)
    expect(closeCount).toBe(4)
  })

  // Реальный пример: песня #57 с несколькими /2р.
  it('обрабатывает строку с текстом между повторами', () => {
    const result = processRepeats('Господь, огонь с небес священный, /Твой огонь /2р. нам пошли!')
    expect(result).toContain('Господь, огонь с небес священный,')
    expect(result).toContain('Твой огонь ')
    expect(result).toContain('нам пошли!')
  })
})

describe('stripRepeats', () => {
  it('возвращает пустую строку для пустого ввода', () => {
    expect(stripRepeats('')).toBe('')
  })

  it('не меняет текст без маркеров', () => {
    expect(stripRepeats('Обычный текст')).toBe('Обычный текст')
  })

  it('удаляет маркеры и оставляет текст', () => {
    expect(stripRepeats('/текст /2р.')).toBe('текст')
  })

  it('удаляет маркеры с продолжением', () => {
    expect(stripRepeats('/Ближе /2р. к кресту')).toBe('Ближе к кресту')
  })

  it('удаляет вложенные маркеры //', () => {
    const result = stripRepeats('//О Иисус мой! /2р. За меня /2р.')
    expect(result).toBe('О Иисус мой! За меня')
  })

  it('схлопывает лишние пробелы', () => {
    const result = stripRepeats('Начало  /текст /2р.  конец')
    expect(result).toBe('Начало текст конец')
  })
})
