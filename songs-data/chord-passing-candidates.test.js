import { describe, it, expect } from 'vitest'
import { parseChordLite, stepDistance, findPassingCandidates } from './chord-passing-candidates.js'

describe('parseChordLite', () => {
  it('трезвучие', () => {
    expect(parseChordLite('C')).toEqual({ root: 'C', bass: null, rootPitch: 0, bassPitch: null })
  })

  it('обращение', () => {
    expect(parseChordLite('G/B')).toEqual({ root: 'G', bass: 'B', rootPitch: 7, bassPitch: 11 })
  })

  it('бемоль и диез', () => {
    expect(parseChordLite('Bb')).toEqual({ root: 'Bb', bass: null, rootPitch: 10, bassPitch: null })
    expect(parseChordLite('D/F#')).toEqual({ root: 'D', bass: 'F#', rootPitch: 2, bassPitch: 6 })
  })

  it('нераспознанное', () => {
    expect(parseChordLite('N.C.')).toBeNull()
    expect(parseChordLite('')).toBeNull()
  })
})

describe('stepDistance', () => {
  it('по кругу из 12 полутонов', () => {
    expect(stepDistance(0, 2)).toBe(2)
    expect(stepDistance(11, 0)).toBe(1) // си → до, через край октавы
    expect(stepDistance(0, 6)).toBe(6) // тритон — максимум на круге
  })
})

describe('findPassingCandidates', () => {
  it('реальный случай — G/B между C и Am (песня 3)', () => {
    // Бас идёт по ступеням вниз: C(0) → B(11) → A(9)
    const text = '{C}Бо{G/B}же! {Am}Слы{F}шать {G}сло{C}во'
    expect(findPassingCandidates(text)).toEqual([{ prev: 'C', chord: 'G/B', next: 'Am' }])
  })

  it('без баса — не кандидат, даже если корень между соседями', () => {
    const text = '{C}раз {D}два {E}три'
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('корень совпал с соседом — это повтор, не проходящий аккорд', () => {
    const text = '{C}раз {C/E}два {G}три'
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('бас далеко от соседей (не шаг, а скачок) — не кандидат', () => {
    const text = '{C}раз {G/D}два {Am}три' // D(2) далеко от C(0) и A(9)
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('разные проходы повтора не считаются соседями', () => {
    const text = '{1:C}раз {2:G/B}два {1:Am}три'
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('один и тот же проход — считается как обычно', () => {
    const text = '{2:C}раз {2:G/B}два {2:Am}три'
    expect(findPassingCandidates(text)).toEqual([{ prev: 'C', chord: 'G/B', next: 'Am' }])
  })

  it('пустая строфа отделяет соседей друг от друга', () => {
    const text = '{C}раз {G/B}два\n\n{Am}три'
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('первый и последний аккорд куска не могут быть кандидатом (нет обоих соседей)', () => {
    const text = '{G/B}раз {C}два'
    expect(findPassingCandidates(text)).toEqual([])
  })

  it('пусто без аккордов', () => {
    expect(findPassingCandidates('просто текст')).toEqual([])
    expect(findPassingCandidates('')).toEqual([])
  })
})
