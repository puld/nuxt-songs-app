import { describe, it, expect } from 'vitest'
import { planChordShifts, CHORD_GAP } from './chordLayout.js'

/** Измерение надписи: строка задаётся `top`, позиция — левым краем и шириной. */
const label = (top, left, width) => ({ top, left, width })

describe('planChordShifts: надписи, которым хватает места', () => {
  it('пустой список', () => {
    expect(planChordShifts([])).toEqual([])
  })

  it('одиночная надпись остаётся на месте', () => {
    expect(planChordShifts([label(0, 40, 20)])).toEqual([0])
  })

  it('разнесённые надписи не двигаются', () => {
    expect(planChordShifts([label(0, 0, 20), label(0, 40, 20)])).toEqual([0, 0])
  })

  it('зазор соблюдается: надпись впритык считается столкнувшейся', () => {
    // край предыдущей — 20, зазор 6: соседка на 24 ближе, чем можно
    const shifts = planChordShifts([label(0, 0, 20), label(0, 24, 20)])
    expect(shifts).not.toEqual([0, 0])
  })
})

describe('planChordShifts: столкнувшиеся надписи центрируются', () => {
  it('пара разъезжается в обе стороны от общей середины', () => {
    // ошибка привязки делится пополам, а не копится на правой надписи
    expect(planChordShifts([label(0, 0, 30), label(0, 20, 30)])).toEqual([-8, 8])
  })

  it('цепочка из трёх: средняя остаётся на месте, крайние расходятся', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30), label(0, 40, 30)]
    expect(planChordShifts(labels)).toEqual([-16, 0, 16])
  })

  it('соседний кластер собирается отдельно', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30), label(0, 200, 30)]
    expect(planChordShifts(labels)).toEqual([-8, 8, 0])
  })

  it('зазор берётся из настройки', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30)]
    expect(planChordShifts(labels, { gap: 0 })).toEqual([-5, 5])
    expect(CHORD_GAP).toBeGreaterThan(0)
  })
})

describe('planChordShifts: строки не смешиваются', () => {
  it('надписи разных строк считаются независимо', () => {
    const labels = [label(0, 0, 30), label(40, 20, 30)]
    expect(planChordShifts(labels)).toEqual([0, 0])
  })

  it('расхождение в пределах пикселя — та же строка', () => {
    // округление в разных браузерах даёт доли пикселя, и строка распалась бы надвое
    expect(planChordShifts([label(0, 0, 30), label(0.5, 20, 30)])).toEqual([-8, 8])
  })
})

describe('planChordShifts: границы строки', () => {
  it('кластер не выходит за правый край', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30)]
    expect(planChordShifts(labels, { maxRight: 50 })).toEqual([-16, 0])
  })

  it('кластер не выходит за левый край', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30)]
    expect(planChordShifts(labels, { minLeft: 0 })).toEqual([0, 16])
  })

  it('край важнее центровки, но наложения не возникает', () => {
    const labels = [label(0, 0, 30), label(0, 20, 30)]
    const shifts = planChordShifts(labels, { minLeft: 0 })
    const first = 0 + shifts[0] + 30
    const second = 20 + shifts[1]
    expect(second - first).toBe(CHORD_GAP)
  })

  it('кластер прижимается к уже размещённому соседу, а не налезает на него', () => {
    const labels = [label(0, 50, 40), label(0, 60, 40), label(0, 120, 30)]
    expect(planChordShifts(labels)).toEqual([-18, 18, 4])
  })
})
