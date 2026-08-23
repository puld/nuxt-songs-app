import { describe, it, expect } from 'vitest'
import { calcPopupOffset, POPUP_TOP_GAP } from './popupOffset'

describe('calcPopupOffset', () => {
    it('попап помещается в видимую область — смещения нет', () => {
        expect(calcPopupOffset(800, 400)).toBe(0)
    })

    it('попап выше видимой области — прижимается к верху с отступом', () => {
        // клавиатура ужала область до 300px, попап 400px:
        // центрирование увело бы верх на -50px за экран
        expect(calcPopupOffset(300, 400)).toBe(50 + POPUP_TOP_GAP)
    })

    it('ровно по высоте — смещение только на отступ', () => {
        expect(calcPopupOffset(400, 400)).toBe(POPUP_TOP_GAP)
    })

    it('без размеров смещение не считается', () => {
        expect(calcPopupOffset(0, 400)).toBe(0)
        expect(calcPopupOffset(800, 0)).toBe(0)
        expect(calcPopupOffset(undefined, undefined)).toBe(0)
    })
})
