import { describe, it, expect } from 'vitest'
import { addRecent, normalizeRecent, RECENT_LIMIT } from './recentSongs.js'

describe('normalizeRecent', () => {
    it('оставляет корректный список как есть', () => {
        expect(normalizeRecent([3, 1, 2])).toEqual([3, 1, 2])
    })

    it('пустое и неинициализированное значение — пустой список', () => {
        expect(normalizeRecent(undefined)).toEqual([])
        expect(normalizeRecent(null)).toEqual([])
        expect(normalizeRecent([])).toEqual([])
    })

    it('не массив — пустой список', () => {
        // Так выглядит значение от другой версии формата или ручная правка.
        expect(normalizeRecent('115')).toEqual([])
        expect(normalizeRecent({ 0: 115 })).toEqual([])
    })

    it('номер-строка считается тем же номером', () => {
        // JSON из localStorage правят руками, типизация тут смысла не несёт.
        expect(normalizeRecent(['115', 7])).toEqual([115, 7])
    })

    it('отбрасывает всё, что не номер песни', () => {
        expect(normalizeRecent([115, '12а', null, 0, -3, 1.5, {}, 7])).toEqual([115, 7])
    })

    it('снимает дубли, оставляя первое вхождение', () => {
        expect(normalizeRecent([5, 3, 5, 1])).toEqual([5, 3, 1])
    })

    it('обрезает до лимита', () => {
        const long = Array.from({ length: RECENT_LIMIT + 4 }, (_, i) => i + 1)

        expect(normalizeRecent(long)).toHaveLength(RECENT_LIMIT)
        expect(normalizeRecent(long)).toEqual(long.slice(0, RECENT_LIMIT))
    })

    it('лимит можно задать явно', () => {
        expect(normalizeRecent([1, 2, 3], 2)).toEqual([1, 2])
    })

    it('дубли не занимают место в лимите', () => {
        // Иначе список из повторов одной песни выглядел бы заполненным.
        expect(normalizeRecent([1, 1, 1, 2, 3], 3)).toEqual([1, 2, 3])
    })
})

describe('addRecent', () => {
    it('добавляет песню в начало', () => {
        expect(addRecent([3, 1], 7)).toEqual([7, 3, 1])
    })

    it('первая песня попадает в пустой список', () => {
        expect(addRecent([], 7)).toEqual([7])
        expect(addRecent(undefined, 7)).toEqual([7])
    })

    it('повторное открытие поднимает песню наверх, а не дублирует', () => {
        expect(addRecent([3, 1, 7], 7)).toEqual([7, 3, 1])
    })

    it('открытие той же песни ничего не меняет', () => {
        expect(addRecent([7, 3], 7)).toEqual([7, 3])
    })

    it('обрезает до лимита, вытесняя самую старую', () => {
        const full = Array.from({ length: RECENT_LIMIT }, (_, i) => i + 1)
        const result = addRecent(full, 999)

        expect(result).toHaveLength(RECENT_LIMIT)
        expect(result[0]).toBe(999)
        expect(result).not.toContain(RECENT_LIMIT)
    })

    it('номер-строка нормализуется', () => {
        expect(addRecent([3], '115')).toEqual([115, 3])
    })

    it('некорректный номер список не меняет', () => {
        // На странице «Песня не найдена» и при мусоре в URL история не портится.
        expect(addRecent([3, 1], NaN)).toEqual([3, 1])
        expect(addRecent([3, 1], undefined)).toEqual([3, 1])
        expect(addRecent([3, 1], 'abc')).toEqual([3, 1])
    })

    it('исходный массив не мутируется', () => {
        const source = [3, 1]
        addRecent(source, 7)

        expect(source).toEqual([3, 1])
    })

    it('чинит испорченное хранилище по ходу добавления', () => {
        expect(addRecent([3, '12а', 3, null], 7)).toEqual([7, 3])
    })
})
