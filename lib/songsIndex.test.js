import { describe, it, expect } from 'vitest'
import { buildSongsMap, songNumbersFrom, getSongTitle, getVariantLabel } from './songsIndex'

describe('songsIndex', () => {
    const songs = [
        { number: 1, title: 'Осенний дождь', variants: [{ label: '', body: [] }] },
        {
            number: 2,
            title: 'Весенняя песня',
            variants: [
                { label: '', body: [] },
                { label: 'вариант для сестёр', body: [] }
            ]
        },
        // Номер строкой — так песни приходят из некоторых источников
        { number: '15', title: 'Дождь в городе', variants: [{ label: 'а', body: [] }, { label: 'б', body: [] }] }
    ]

    describe('buildSongsMap', () => {
        it('строит карту по номеру песни', () => {
            const map = buildSongsMap(songs)

            expect(map.size).toBe(3)
            expect(map.get(1).title).toBe('Осенний дождь')
        })

        it('приводит номер-строку к числу', () => {
            const map = buildSongsMap(songs)

            expect(map.get(15).title).toBe('Дождь в городе')
            expect(map.get('15')).toBeUndefined()
        })

        it('возвращает пустую карту для пустого списка и для отсутствующего аргумента', () => {
            expect(buildSongsMap([]).size).toBe(0)
            expect(buildSongsMap(undefined).size).toBe(0)
        })
    })

    describe('songNumbersFrom', () => {
        it('возвращает номера числами в порядке следования песен', () => {
            expect(songNumbersFrom(songs)).toEqual([1, 2, 15])
        })

        it('возвращает пустой массив без песен', () => {
            expect(songNumbersFrom([])).toEqual([])
            expect(songNumbersFrom(undefined)).toEqual([])
        })
    })

    describe('getSongTitle', () => {
        const map = buildSongsMap(songs)

        it('возвращает название по номеру', () => {
            expect(getSongTitle(map, 2)).toBe('Весенняя песня')
        })

        it('принимает номер строкой', () => {
            expect(getSongTitle(map, '2')).toBe('Весенняя песня')
        })

        it('возвращает заглушку для неизвестного номера', () => {
            expect(getSongTitle(map, 999)).toBe('Неизвестная песня')
        })

        it('не падает без карты', () => {
            expect(getSongTitle(null, 1)).toBe('Неизвестная песня')
        })
    })

    describe('getVariantLabel', () => {
        const map = buildSongsMap(songs)

        it('возвращает метку варианта, если вариантов несколько', () => {
            expect(getVariantLabel(map, 2, 1)).toBe('вариант для сестёр')
            expect(getVariantLabel(map, 15, 0)).toBe('а')
        })

        it('возвращает пустую строку для единственного варианта', () => {
            expect(getVariantLabel(map, 1, 0)).toBe('')
        })

        it('возвращает пустую строку для несуществующего варианта', () => {
            expect(getVariantLabel(map, 2, 5)).toBe('')
        })

        it('возвращает пустую строку для неизвестной песни и без карты', () => {
            expect(getVariantLabel(map, 999, 0)).toBe('')
            expect(getVariantLabel(null, 1, 0)).toBe('')
        })
    })
})
