import { describe, it, expect } from 'vitest'
import { renderChords, hasChords } from './chordMarkup.js'

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
