import { describe, it, expect } from 'vitest'
import {
    TAPS_REQUIRED,
    TAP_TIMEOUT_MS,
    initialTapState,
    registerTap,
    shouldHint
} from './devMode'

/**
 * Прогоняет серию тапов с фиксированным интервалом.
 * @param {number} taps - сколько тапов сделать
 * @param {number} intervalMs - пауза между тапами
 * @returns {object} состояние после последнего тапа
 */
const tapSeries = (taps, intervalMs = 100) => {
    let state = initialTapState()
    let now = 1_000_000

    for (let i = 0; i < taps; i++) {
        now += intervalMs
        state = registerTap(state, now)
    }

    return state
}

describe('devMode: активация тапами', () => {
    it('начальное состояние — нулевой счётчик', () => {
        expect(initialTapState()).toEqual({ count: 0, lastTapAt: 0 })
    })

    it('первый тап не активирует режим', () => {
        const state = tapSeries(1)

        expect(state.activated).toBe(false)
        expect(state.count).toBe(1)
        expect(state.remaining).toBe(TAPS_REQUIRED - 1)
    })

    it(`не активирует до ${TAPS_REQUIRED} тапов`, () => {
        for (let taps = 1; taps < TAPS_REQUIRED; taps++) {
            expect(tapSeries(taps).activated).toBe(false)
        }
    })

    it(`активирует ровно на ${TAPS_REQUIRED}-м тапе`, () => {
        const state = tapSeries(TAPS_REQUIRED)

        expect(state.activated).toBe(true)
        expect(state.remaining).toBe(0)
    })

    it('после активации счётчик сброшен — следующая серия начинается с нуля', () => {
        const state = tapSeries(TAPS_REQUIRED)

        expect(state.count).toBe(0)

        // Один тап после активации не должен активировать снова
        const next = registerTap(state, 2_000_000)
        expect(next.activated).toBe(false)
        expect(next.count).toBe(1)
    })

    it('пауза больше таймаута сбрасывает счётчик', () => {
        let state = initialTapState()
        let now = 1_000_000

        // Шесть тапов подряд — до активации остаётся один
        for (let i = 0; i < TAPS_REQUIRED - 1; i++) {
            now += 100
            state = registerTap(state, now)
        }
        expect(state.remaining).toBe(1)

        // Долгая пауза — и следующий тап считается первым, а не седьмым
        now += TAP_TIMEOUT_MS + 1
        state = registerTap(state, now)

        expect(state.activated).toBe(false)
        expect(state.count).toBe(1)
    })

    it('пауза ровно в таймаут ещё не сбрасывает счётчик', () => {
        let state = registerTap(initialTapState(), 1_000_000)
        state = registerTap(state, 1_000_000 + TAP_TIMEOUT_MS)

        expect(state.count).toBe(2)
    })

    it('медленные тапы в пределах таймаута активируют режим', () => {
        const state = tapSeries(TAPS_REQUIRED, TAP_TIMEOUT_MS)

        expect(state.activated).toBe(true)
    })

    it('не мутирует переданное состояние', () => {
        const state = initialTapState()
        const frozen = Object.freeze({ ...state })

        expect(() => registerTap(frozen, 1_000_000)).not.toThrow()
        expect(frozen).toEqual({ count: 0, lastTapAt: 0 })
    })
})

describe('devMode: подсказка об остатке', () => {
    it('молчит на первых тапах', () => {
        expect(shouldHint(TAPS_REQUIRED - 1)).toBe(false)
        expect(shouldHint(4)).toBe(false)
    })

    it('показывается на последних трёх тапах', () => {
        expect(shouldHint(3)).toBe(true)
        expect(shouldHint(2)).toBe(true)
        expect(shouldHint(1)).toBe(true)
    })

    it('не показывается после активации', () => {
        expect(shouldHint(0)).toBe(false)
    })
})
