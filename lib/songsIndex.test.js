import { describe, it, expect } from 'vitest'
import { buildSongsMap, songNumbersFrom, getSongTitle, getVariantLabel, buildSectionIndex, getSongSection } from './songsIndex'

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

describe('buildSectionIndex / getSongSection', () => {
    const sections = [
        { id: 0, title: 'Хвала', songNumbers: [1, 2] },
        { id: 1, title: 'Молитва', songNumbers: [7] }
    ]

    it('находит раздел песни по номеру', () => {
        const index = buildSectionIndex(sections)

        expect(getSongSection(index, 2)).toEqual({ id: 0, title: 'Хвала' })
        expect(getSongSection(index, 7)).toEqual({ id: 1, title: 'Молитва' })
    })

    it('песня вне разделов — null', () => {
        expect(getSongSection(buildSectionIndex(sections), 999)).toBeNull()
    })

    it('номер-строка считается тем же номером', () => {
        const index = buildSectionIndex([{ id: 0, title: 'Хвала', songNumbers: ['5'] }])

        expect(getSongSection(index, 5)).toEqual({ id: 0, title: 'Хвала' })
        expect(getSongSection(index, '5')).toEqual({ id: 0, title: 'Хвала' })
    })

    it('песня в двух разделах закрепляется за первым', () => {
        // Сборник такого не допускает (проверяет sections-integrity), но
        // данные могут приехать из старой базы.
        const index = buildSectionIndex([
            { id: 0, title: 'Первый', songNumbers: [3] },
            { id: 1, title: 'Второй', songNumbers: [3] }
        ])

        expect(getSongSection(index, 3)).toEqual({ id: 0, title: 'Первый' })
    })

    it('значения, которые не номера, пропускаются', () => {
        const index = buildSectionIndex([{ id: 0, title: 'Хвала', songNumbers: ['12а', null, 4] }])

        expect(index.size).toBe(1)
        expect(getSongSection(index, 4)).toEqual({ id: 0, title: 'Хвала' })
    })

    it('раздел без названия даёт пустую строку, а не undefined', () => {
        const index = buildSectionIndex([{ id: 3, songNumbers: [1] }])

        expect(getSongSection(index, 1)).toEqual({ id: 3, title: '' })
    })

    it('пустые и отсутствующие данные не роняют построение', () => {
        expect(buildSectionIndex(undefined).size).toBe(0)
        expect(buildSectionIndex([]).size).toBe(0)
        expect(buildSectionIndex([{ id: 0, title: 'Пустой' }]).size).toBe(0)
        expect(getSongSection(undefined, 1)).toBeNull()
    })
})
