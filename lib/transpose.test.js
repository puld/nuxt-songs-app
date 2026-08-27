import { describe, it, expect } from 'vitest'
import {
  parseChord, pitchOf, noteName, normalizeTranspose, transposeChord,
  transposeText, stripChordBass, stripBassText, preferSharp, songKey,
  formatTranspose, stepTranspose,
  TRANSPOSE_MIN, TRANSPOSE_MAX
} from './transpose.js'

describe('parseChord', () => {
  it('трезвучие', () => {
    expect(parseChord('C')).toEqual({ root: 'C', suffix: '', bass: null })
  })

  it('минор с септимой', () => {
    expect(parseChord('Am7')).toEqual({ root: 'A', suffix: 'm7', bass: null })
  })

  it('бемоль в корне', () => {
    expect(parseChord('Bb')).toEqual({ root: 'Bb', suffix: '', bass: null })
  })

  it('аккорд с басом', () => {
    expect(parseChord('G/B')).toEqual({ root: 'G', suffix: '', bass: 'B' })
  })

  it('бас с диезом', () => {
    expect(parseChord('D7/F#')).toEqual({ root: 'D', suffix: '7', bass: 'F#' })
  })

  it('незнакомый суффикс сохраняется целиком', () => {
    // в сборнике есть D(sus4), E0, G#0 — перечислять обозначения незачем
    expect(parseChord('D(sus4)').suffix).toBe('(sus4)')
    expect(parseChord('E07').suffix).toBe('07')
  })

  it('не аккорд', () => {
    expect(parseChord('Hm')).toBeNull()
    expect(parseChord('')).toBeNull()
  })
})

describe('pitchOf', () => {
  it('английская нотация: B — си, Bb — си-бемоль', () => {
    expect(pitchOf('B')).toBe(11)
    expect(pitchOf('Bb')).toBe(10)
  })

  it('диез повышает', () => {
    expect(pitchOf('F#')).toBe(6)
  })

  it('мусор', () => {
    expect(pitchOf('X')).toBeNull()
  })
})

describe('noteName', () => {
  it('по умолчанию чёрные клавиши бемольные, кроме фа-диеза', () => {
    expect(noteName(1)).toBe('Db')
    expect(noteName(10)).toBe('Bb')
    expect(noteName(6)).toBe('F#')
  })

  it('в диезном наборе — диезы', () => {
    expect(noteName(1, true)).toBe('C#')
    expect(noteName(10, true)).toBe('A#')
  })

  it('выход за октаву заворачивается', () => {
    expect(noteName(12)).toBe('C')
    expect(noteName(-1)).toBe('B')
  })
})

describe('normalizeTranspose', () => {
  it('целое в диапазоне остаётся', () => {
    expect(normalizeTranspose(-6)).toBe(-6)
    expect(normalizeTranspose(5)).toBe(5)
  })

  it('за краем диапазона — ноль', () => {
    expect(normalizeTranspose(6)).toBe(0)
    expect(normalizeTranspose(-7)).toBe(0)
  })

  it('мусор из хранилища — ноль', () => {
    expect(normalizeTranspose('abc')).toBe(0)
    expect(normalizeTranspose(null)).toBe(0)
    expect(normalizeTranspose(undefined)).toBe(0)
  })

  it('дробное обрезается', () => {
    expect(normalizeTranspose(2.7)).toBe(2)
  })
})

describe('transposeChord', () => {
  it('вверх', () => {
    expect(transposeChord('C', 2)).toBe('D')
  })

  it('вниз', () => {
    expect(transposeChord('C', -1)).toBe('B')
  })

  it('суффикс не трогается', () => {
    expect(transposeChord('Am7', 3)).toBe('Cm7')
  })

  it('бас едет вместе с аккордом', () => {
    expect(transposeChord('G/B', 2)).toBe('A/Db')
    expect(transposeChord('G/B', 2, true)).toBe('A/C#')
  })

  it('нераспознанное возвращается как есть', () => {
    expect(transposeChord('N.C.', 2)).toBe('N.C.')
  })

  it('нулевой сдвиг ничего не меняет', () => {
    expect(transposeChord('Bb7/F', 0)).toBe('Bb7/F')
  })
})

describe('transposeText', () => {
  it('надписи над строкой', () => {
    expect(transposeText('{Am}Слава {Dm}Богу', 2)).toBe('{Bm}Слава {Em}Богу')
  })

  it('строчный аккорд остаётся строчным', () => {
    expect(transposeText('пе{_G}ред', 2)).toBe('пе{_A}ред')
  })

  it('текст песни не меняется', () => {
    expect(transposeText('{C}Слово', 1)).toBe('{Db}Слово')
  })

  it('нулевой сдвиг возвращает исходную строку', () => {
    const src = '{Am}Слава'
    expect(transposeText(src, 0)).toBe(src)
  })

  it('пустой текст', () => {
    expect(transposeText('', 3)).toBe('')
  })

  it('ремарка в квадратных скобках не задевается', () => {
    expect(transposeText('[Припев тише] {C}Свет', 2)).toBe('[Припев тише] {D}Свет')
  })
})

describe('stripChordBass', () => {
  it('бас отбрасывается', () => {
    expect(stripChordBass('G/B')).toBe('G')
  })

  it('суффикс остаётся', () => {
    expect(stripChordBass('D7/F#')).toBe('D7')
    expect(stripChordBass('Am7/G')).toBe('Am7')
  })

  it('аккорд без баса не меняется', () => {
    expect(stripChordBass('Am')).toBe('Am')
    expect(stripChordBass('Bb')).toBe('Bb')
  })

  it('нераспознанное возвращается как есть', () => {
    expect(stripChordBass('N.C.')).toBe('N.C.')
    expect(stripChordBass('')).toBe('')
  })
})

describe('stripBassText', () => {
  it('надписи над строкой', () => {
    expect(stripBassText('{G/B}Слава {D7/F#}Богу')).toBe('{G}Слава {D7}Богу')
  })

  it('строчный аккорд остаётся строчным', () => {
    expect(stripBassText('пе{_C/E}ред')).toBe('пе{_C}ред')
  })

  it('аккорды без баса и текст не трогаются', () => {
    const src = '{Am}Слава {Dm}Богу'
    expect(stripBassText(src)).toBe(src)
  })

  it('пустой текст', () => {
    expect(stripBassText('')).toBe('')
  })

  it('вместе со сдвигом бас уходит после транспонирования', () => {
    expect(stripBassText(transposeText('{G/B}текст', 2))).toBe('{A}текст')
  })
})

describe('preferSharp: набор знаков берётся у целевой тональности', () => {
  it('до-мажор вверх на два — ре-мажор, знаки диезные', () => {
    expect(preferSharp('{C}текст', 2)).toBe(true)
  })

  it('до-мажор вниз на два — си-бемоль, знаки бемольные', () => {
    expect(preferSharp('{C}текст', -2)).toBe(false)
  })

  it('минор считается по параллельному мажору', () => {
    // Am + 2 = Bm, её параллельный мажор — ре, тональность диезная
    expect(preferSharp('{Am}текст', 2)).toBe(true)
  })

  it('до-диез мажор пишется бемолями', () => {
    // Am + 1 = Bbm: параллельный ему до-диез мажор дал бы семь диезов и «A#m»
    expect(preferSharp('{Am}текст', 1)).toBe(false)
  })

  it('без аккордов набор не выбирается', () => {
    expect(preferSharp('просто текст', 3)).toBe(false)
  })
})

describe('songKey', () => {
  it('мажор', () => {
    expect(songKey('{F}текст {Bb}ещё')).toBe('F')
  })

  it('минор помечается', () => {
    expect(songKey('{Am}текст')).toBe('Am')
  })

  it('со сдвигом', () => {
    expect(songKey('{Am}текст', 3)).toBe('Cm')
  })

  it('maj не путается с минором', () => {
    expect(songKey('{Cmaj7}текст')).toBe('C')
  })

  it('без аккордов пусто', () => {
    expect(songKey('текст без аккордов')).toBe('')
  })
})

describe('formatTranspose', () => {
  it('плюс и минус', () => {
    expect(formatTranspose(2)).toBe('+2')
    expect(formatTranspose(-3)).toBe('−3')
  })

  it('ноль без знака', () => {
    expect(formatTranspose(0)).toBe('0')
  })

  it('мусор показывается нулём', () => {
    expect(formatTranspose('x')).toBe('0')
  })
})

describe('stepTranspose', () => {
  it('шаг вверх и вниз', () => {
    expect(stepTranspose(0, 1)).toBe(1)
    expect(stepTranspose(0, -1)).toBe(-1)
  })

  it('за верхним краем значение не меняется', () => {
    expect(stepTranspose(TRANSPOSE_MAX, 1)).toBe(TRANSPOSE_MAX)
  })

  it('за нижним краем значение не меняется', () => {
    expect(stepTranspose(TRANSPOSE_MIN, -1)).toBe(TRANSPOSE_MIN)
  })

  it('мусор считается нулём', () => {
    expect(stepTranspose('x', 1)).toBe(1)
  })
})
