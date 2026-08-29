import { describe, it, expect } from 'vitest'
import { renderChords, hasChords, hasPassChords, passesOf, chordsForPass } from './chordMarkup.js'

/** Ожидаемая надпись над строкой. */
const label = (chord) => `<i class='chord-label' aria-hidden='true'>${chord}</i>`

describe('renderChords: аккорд над строкой', () => {
  it('надпись встаёт перед своим слогом', () => {
    expect(renderChords('{Am}Слава', true)).toBe(`${label('Am')}Слава`)
  })

  it('слово с двумя аккордами не режется', () => {
    // текст остаётся цельным: надписи выводятся из потока стилями
    expect(renderChords('{Am/E}взира{F}ю', true)).toBe(`${label('Am/E')}взира${label('F')}ю`)
  })

  it('аккорд внутри слова не разрывает его', () => {
    expect(renderChords('Спаси{C}тель', true)).toBe(`Спаси${label('C')}тель`)
  })

  it('надпись скрыта от диктора', () => {
    expect(renderChords('{Am}Слава', true)).toContain("aria-hidden='true'")
  })

  it('соседние слова размечаются каждое отдельно', () => {
    expect(renderChords('{D}Бог {E}нас', true)).toBe(`${label('D')}Бог ${label('E')}нас`)
  })

  it('аккорд с басом остаётся целым', () => {
    expect(renderChords('{G/B}ла', true)).toBe(`${label('G/B')}ла`)
  })

  it('аккорд в конце строки', () => {
    expect(renderChords('спас {A}', true)).toBe(`спас ${label('A')}`)
  })
})

describe('renderChords: разметка повторов', () => {
  it('теги повторов остаются как есть', () => {
    expect(renderChords('{E}Бог <span class="repeat">нас</span>', true))
      .toBe(`${label('E')}Бог <span class="repeat">нас</span>`)
  })

  it('тег, открытый внутри слова, не мешает надписи', () => {
    // обёртки вокруг слова нет, поэтому пересечься с разметкой повтора нечему
    expect(renderChords('<span class="repeat">{E}Бог', true))
      .toBe(`<span class="repeat">${label('E')}Бог`)
  })
})

describe('renderChords: аккорд в строке', () => {
  it('{_G} не поднимается над словом', () => {
    expect(renderChords('пе{_G}ред', true)).toBe("пе<span class='chord'>G</span>ред")
  })

  it('оба вида аккордов в одном слове', () => {
    expect(renderChords('{Am}Сло{_G}во', true))
      .toBe(`${label('Am')}Сло<span class='chord'>G</span>во`)
  })
})

describe('renderChords: аккорды выключены', () => {
  it('обозначения снимаются вместе со скобками', () => {
    expect(renderChords('{Am}Сло{_G}во {G/B}ла', false)).toBe('Слово ла')
  })

  it('пустой текст остаётся пустым', () => {
    expect(renderChords('', true)).toBe('')
  })
})

describe('hasChords', () => {
  it('строка с аккордом', () => {
    expect(hasChords('{Am}Слава')).toBe(true)
  })

  it('строка без аккордов', () => {
    expect(hasChords('Слава')).toBe(false)
  })

  it('пустая строка', () => {
    expect(hasChords('')).toBe(false)
  })
})

describe('passesOf: номера проходов повтора', () => {
  it('пометки нет — аккорд звучит в каждом проходе', () => {
    expect(passesOf('')).toBeNull()
    expect(passesOf(undefined)).toBeNull()
  })

  it('один номер', () => {
    expect(passesOf('2')).toEqual([2])
  })

  it('несколько номеров через запятую', () => {
    expect(passesOf('1,3')).toEqual([1, 3])
  })

  it('мусор читается как отсутствие пометки', () => {
    expect(passesOf('abc')).toBeNull()
  })

  it('ноль выбрасывается: проходы нумеруются с единицы', () => {
    // такую разметку бракует линтер — здесь важно, что аккорд не пропадает
    expect(passesOf('0')).toBeNull()
  })
})

describe('hasPassChords: только помеченный повтор разворачивается', () => {
  it('аккорд с пометкой', () => {
    expect(hasPassChords('{2:Dm}Слава')).toBe(true)
  })

  it('аккорд без пометки', () => {
    expect(hasPassChords('{Dm}Слава')).toBe(false)
  })

  it('текст без аккордов', () => {
    expect(hasPassChords('Слава')).toBe(false)
  })

  it('пустая строка', () => {
    expect(hasPassChords('')).toBe(false)
  })

  it('повторный вызов отвечает так же', () => {
    // регулярка глобальная: без сброса lastIndex второй вызов промахнулся бы
    expect(hasPassChords('{2:F}Бог')).toBe(true)
    expect(hasPassChords('{2:F}Бог')).toBe(true)
  })
})

describe('chordsForPass: аккорды одного прохода', () => {
  it('аккорд без пометки достаётся каждому проходу', () => {
    expect(chordsForPass('{Dm}Слава', 1)).toBe('{Dm}Слава')
    expect(chordsForPass('{Dm}Слава', 2)).toBe('{Dm}Слава')
  })

  it('помеченный аккорд звучит только в своём проходе', () => {
    expect(chordsForPass('Бли{2:F}зок', 1)).toBe('Близок')
    expect(chordsForPass('Бли{2:F}зок', 2)).toBe('Бли{F}зок')
  })

  it('пометка снимается — до отрисовки номер не доживает', () => {
    expect(chordsForPass('{2:Dm}Слава', 2)).toBe('{Dm}Слава')
  })

  it('несколько номеров: первый и третий проходы', () => {
    expect(chordsForPass('{1,3:C}Гос', 1)).toBe('{C}Гос')
    expect(chordsForPass('{1,3:C}Гос', 2)).toBe('Гос')
    expect(chordsForPass('{1,3:C}Гос', 3)).toBe('{C}Гос')
  })

  it('строчный аккорд остаётся строчным', () => {
    expect(chordsForPass('пе{2:_G}ред', 2)).toBe('пе{_G}ред')
    expect(chordsForPass('пе{2:_G}ред', 1)).toBe('перед')
  })

  it('помеченный и обычный аккорды в одной строке', () => {
    expect(chordsForPass('{Dm}Бли{2:F}зок {1,3:C}Гос', 2)).toBe('{Dm}Бли{F}зок Гос')
  })

  it('текст между аккордами не трогается', () => {
    expect(chordsForPass('{Dm}а {5:F}б', 1)).toBe('{Dm}а б')
  })

  it('пустой текст', () => {
    expect(chordsForPass('', 1)).toBe('')
  })
})

describe('renderChords: уцелевшая пометка прохода', () => {
  it('номер на экран не попадает', () => {
    // повтора вокруг нет (такие данные бракует линтер) — но «2:Dm» над слогом
    // читалось бы как аккорд
    expect(renderChords('{2:Dm}Слава', true)).toBe(`${label('Dm')}Слава`)
  })

  it('несколько номеров тоже снимаются', () => {
    expect(renderChords('{1,3:F}Слава', true)).toBe(`${label('F')}Слава`)
  })

  it('строчный аккорд с пометкой', () => {
    expect(renderChords('пе{2:_G}ред', true)).toBe("пе<span class='chord'>G</span>ред")
  })

  it('с выключенными аккордами уходит вместе с пометкой', () => {
    expect(renderChords('{2:Dm}Сло{1,3:_G}во', false)).toBe('Слово')
  })
})
