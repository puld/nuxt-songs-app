import { describe, it, expect } from 'vitest'
import { backTarget, HOME_ROUTE } from './navBack.js'

describe('backTarget', () => {
    it('возвращает null, когда в истории есть предыдущая запись', () => {
        expect(backTarget({ back: '/song/115' })).toBe(null)
    })

    it('ведёт на главную, когда предыдущей записи нет', () => {
        expect(backTarget({ back: null })).toBe(HOME_ROUTE)
    })

    it('ведёт на главную при отсутствующем состоянии истории', () => {
        expect(backTarget(null)).toBe(HOME_ROUTE)
        expect(backTarget(undefined)).toBe(HOME_ROUTE)
    })

    it('пустая строка в back — это тоже «возвращаться некуда»', () => {
        expect(backTarget({ back: '' })).toBe(HOME_ROUTE)
    })

    it('запасной адрес можно задать', () => {
        expect(backTarget({}, '/songs')).toBe('/songs')
    })
})
