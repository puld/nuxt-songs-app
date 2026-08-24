import { describe, it, expect } from 'vitest'
import { joinUrl, songPath, songShareTitle, collectionShareTitle, shareMethod, shareDataBudget, SHARE_URL_LIMIT, IMPORT_ROUTE } from './share'

describe('joinUrl', () => {
    it('склеивает origin и путь ровно одним слешем', () => {
        expect(joinUrl('https://example.org', '/song/115')).toBe('https://example.org/song/115')
        expect(joinUrl('https://example.org/', '/song/115')).toBe('https://example.org/song/115')
        expect(joinUrl('https://example.org', 'song/115')).toBe('https://example.org/song/115')
    })

    it('путь с baseURL приложения не теряется', () => {
        // На GitHub Pages приложение живёт не в корне домена.
        expect(joinUrl('https://puld.github.io', '/nuxt-songs-app/song/115'))
            .toBe('https://puld.github.io/nuxt-songs-app/song/115')
    })

    it('пустой путь оставляет один origin без хвостового слеша', () => {
        expect(joinUrl('https://example.org/', '')).toBe('https://example.org')
    })
})

describe('songPath', () => {
    it('нулевой вариант в адрес не пишется', () => {
        expect(songPath(115)).toBe('/song/115')
        expect(songPath(115, 0)).toBe('/song/115')
    })

    it('ненулевой вариант уходит в query', () => {
        expect(songPath(115, 2)).toBe('/song/115?v=2')
    })

    it('мусорный вариант приравнивается к нулевому', () => {
        expect(songPath(115, 'два')).toBe('/song/115')
        expect(songPath(115, -1)).toBe('/song/115')
    })
})

describe('подписи', () => {
    it('номер песни идёт первым', () => {
        expect(songShareTitle({ number: 115, title: 'Тихо в саду' })).toBe('№ 115. Тихо в саду')
    })

    it('метка варианта попадает в подпись', () => {
        expect(songShareTitle({ number: 115, title: 'Тихо в саду', variantLabel: 'вариант для сестёр' }))
            .toBe('№ 115. Тихо в саду (вариант для сестёр)')
    })

    it('пустая метка не оставляет пустых скобок', () => {
        expect(songShareTitle({ number: 115, title: 'Тихо в саду', variantLabel: '  ' }))
            .toBe('№ 115. Тихо в саду')
    })

    it('подборка названа в кавычках', () => {
        expect(collectionShareTitle('Молодёжное')).toBe('Подборка «Молодёжное»')
    })
})

describe('shareMethod', () => {
    it('системная шторка предпочтительнее буфера', () => {
        expect(shareMethod({ share: () => {}, clipboard: { writeText: () => {} } })).toBe('share')
    })

    it('без Web Share остаётся буфер', () => {
        expect(shareMethod({ clipboard: { writeText: () => {} } })).toBe('copy')
    })

    it('без обоих способов кнопку показывать нечем', () => {
        // Буфер требует защищённого контекста: по http кнопка была бы мёртвой.
        expect(shareMethod({})).toBe('none')
        expect(shareMethod({ clipboard: {} })).toBe('none')
        expect(shareMethod(null)).toBe('none')
    })
})

describe('IMPORT_ROUTE', () => {
    it('ведёт на страницу импорта подборки', () => {
        expect(IMPORT_ROUTE).toBe('/collections/import')
    })
})

describe('shareDataBudget', () => {
    it('вычитает базовый адрес из порога', () => {
        const base = 'https://example.com/collections/import#'

        expect(shareDataBudget(base)).toBe(SHARE_URL_LIMIT - base.length)
    })

    it('базовый адрес длиннее порога даёт ноль, а не отрицательное число', () => {
        expect(shareDataBudget('x'.repeat(SHARE_URL_LIMIT + 10))).toBe(0)
    })

    it('порог можно задать', () => {
        expect(shareDataBudget('abc', 10)).toBe(7)
    })

    it('негодный порог не превращается в бесконечный бюджет', () => {
        expect(shareDataBudget('abc', 0)).toBe(0)
        expect(shareDataBudget('abc', NaN)).toBe(0)
    })
})
