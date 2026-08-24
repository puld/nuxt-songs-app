import { describe, it, expect } from 'vitest'
import {
    checkSongsVersion,
    planShareImport,
    findSameNameCollection,
    uniqueCollectionName,
    VERSION_OK,
    VERSION_OUTDATED,
    VERSION_AHEAD,
    ITEM_OK,
    ITEM_MISSING,
    ITEM_VARIANT_FALLBACK
} from './collectionImport'

const songsMap = new Map([
    [10, { number: 10, title: 'Одна песня' }],
    [20, { number: 20, title: 'Две версии', variants: [{ label: '' }, { label: 'б' }] }]
])

describe('checkSongsVersion', () => {
    it('равные версии — импорт без оговорок', () => {
        expect(checkSongsVersion(3, 3)).toBe(VERSION_OK)
    })

    it('база получателя старше — импорт останавливается', () => {
        // Номеров из ссылки в старой базе может не быть вовсе.
        expect(checkSongsVersion(5, 3)).toBe(VERSION_OUTDATED)
    })

    it('база получателя новее — импорт идёт, но варианты могли разъехаться', () => {
        expect(checkSongsVersion(3, 5)).toBe(VERSION_AHEAD)
    })

    it('отсутствующая версия считается нулевой', () => {
        expect(checkSongsVersion(undefined, undefined)).toBe(VERSION_OK)
        expect(checkSongsVersion(2, null)).toBe(VERSION_OUTDATED)
        expect(checkSongsVersion(null, 2)).toBe(VERSION_AHEAD)
    })
})

describe('planShareImport', () => {
    it('песня с существующим вариантом сохраняется как есть', () => {
        const plan = planShareImport([{ songNumber: 20, variantIndex: 1 }], songsMap)

        expect(plan.items[0]).toMatchObject({ songNumber: 20, variantIndex: 1, title: 'Две версии', status: ITEM_OK })
        expect(plan.toSave).toHaveLength(1)
        expect(plan.missing).toBe(0)
        expect(plan.adjusted).toBe(0)
    })

    it('вариант вне диапазона прижимается к нулевому с пометкой', () => {
        const plan = planShareImport([{ songNumber: 20, variantIndex: 5 }], songsMap)

        expect(plan.items[0]).toMatchObject({
            songNumber: 20,
            variantIndex: 0,
            requestedVariantIndex: 5,
            status: ITEM_VARIANT_FALLBACK
        })
        expect(plan.adjusted).toBe(1)
        expect(plan.toSave).toHaveLength(1)
    })

    it('у песни без массива вариантов существует только нулевой', () => {
        const plan = planShareImport([{ songNumber: 10, variantIndex: 1 }], songsMap)

        expect(plan.items[0].status).toBe(ITEM_VARIANT_FALLBACK)
        expect(plan.items[0].variantIndex).toBe(0)
    })

    it('отсутствующая песня пропускается, остальные сохраняются', () => {
        // Терять всю подборку из-за одной песни хуже, чем сохранить остальное.
        const plan = planShareImport(
            [{ songNumber: 10, variantIndex: 0 }, { songNumber: 999, variantIndex: 0 }],
            songsMap
        )

        expect(plan.missing).toBe(1)
        expect(plan.toSave).toHaveLength(1)
        expect(plan.toSave[0].songNumber).toBe(10)
        expect(plan.items[1].status).toBe(ITEM_MISSING)
    })

    it('мусорные номера отбрасываются молча', () => {
        const plan = planShareImport([{ songNumber: 0 }, { songNumber: -3 }, { songNumber: 'x' }, null], songsMap)

        expect(plan.items).toHaveLength(0)
    })

    it('пустой и невалидный список не роняют разбор', () => {
        expect(planShareImport(undefined, songsMap).items).toHaveLength(0)
        expect(planShareImport([{ songNumber: 10 }], null).items[0].status).toBe(ITEM_MISSING)
    })
})

describe('findSameNameCollection', () => {
    const collections = [
        { id: 1, name: 'Избранное', isFavorite: 1 },
        { id: 2, name: 'Рождество' }
    ]

    it('находит подборку с тем же именем без учёта регистра и пробелов', () => {
        expect(findSameNameCollection('  рождество ', collections)).toMatchObject({ id: 2 })
    })

    it('«Избранное» под слияние не подставляется', () => {
        // Имя у него служебное, и подменять его содержимое чужой ссылкой нечего.
        expect(findSameNameCollection('Избранное', collections)).toBeNull()
    })

    it('без совпадения возвращает null', () => {
        expect(findSameNameCollection('Пасха', collections)).toBeNull()
        expect(findSameNameCollection('', collections)).toBeNull()
    })
})

describe('uniqueCollectionName', () => {
    it('свободное имя остаётся как есть', () => {
        expect(uniqueCollectionName('Пасха', [{ name: 'Рождество' }])).toBe('Пасха')
    })

    it('занятое имя получает счётчик', () => {
        expect(uniqueCollectionName('Рождество', [{ name: 'Рождество' }])).toBe('Рождество (2)')
    })

    it('счётчик пропускает уже занятые номера', () => {
        expect(uniqueCollectionName('Рождество', [{ name: 'Рождество' }, { name: 'Рождество (2)' }]))
            .toBe('Рождество (3)')
    })

    it('пустое имя не превращается в счётчик', () => {
        expect(uniqueCollectionName('   ', [])).toBe('')
    })
})
