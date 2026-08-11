import { describe, it, expect, vi } from 'vitest'
import { isPersistSupported, requestPersistentStorage, getStorageEstimate, formatBytes } from './storagePersist'

describe('isPersistSupported', () => {
    it('true, когда есть обе функции', () => {
        expect(isPersistSupported({ persist: () => {}, persisted: () => {} })).toBe(true)
    })

    it('false для окружения без API', () => {
        expect(isPersistSupported(undefined)).toBe(false)
        expect(isPersistSupported({})).toBe(false)
        expect(isPersistSupported({ persist: () => {} })).toBe(false)
    })
})

describe('requestPersistentStorage', () => {
    it('запрашивает флаг, если его ещё нет', async () => {
        const persist = vi.fn(async () => true)
        const storage = { persisted: async () => false, persist }

        expect(await requestPersistentStorage(storage)).toEqual({
            supported: true, persisted: true, requested: true
        })
        expect(persist).toHaveBeenCalledOnce()
    })

    it('не запрашивает повторно, если флаг уже выдан', async () => {
        const persist = vi.fn(async () => true)
        const storage = { persisted: async () => true, persist }

        expect(await requestPersistentStorage(storage)).toEqual({
            supported: true, persisted: true, requested: false
        })
        // Повторный запрос бесполезен и может показать лишний промпт
        expect(persist).not.toHaveBeenCalled()
    })

    it('отказ браузера — не ошибка, а persisted: false', async () => {
        const storage = { persisted: async () => false, persist: async () => false }

        expect(await requestPersistentStorage(storage)).toEqual({
            supported: true, persisted: false, requested: true
        })
    })

    it('исключение внутри API не пробрасывается наружу', async () => {
        const storage = {
            persisted: async () => { throw new Error('приватный режим') },
            persist: async () => true
        }

        expect(await requestPersistentStorage(storage)).toEqual({
            supported: true, persisted: false, requested: false
        })
    })

    it('окружение без API не считается поддерживаемым', async () => {
        expect(await requestPersistentStorage({})).toEqual({
            supported: false, persisted: false, requested: false
        })
    })
})

describe('getStorageEstimate', () => {
    it('возвращает числа', async () => {
        const storage = { estimate: async () => ({ usage: 1024, quota: 4096 }) }

        expect(await getStorageEstimate(storage)).toEqual({ usage: 1024, quota: 4096 })
    })

    it('null, если API нет или оно упало', async () => {
        expect(await getStorageEstimate({})).toBeNull()
        expect(await getStorageEstimate({ estimate: async () => { throw new Error('нет') } })).toBeNull()
    })

    it('нечисловые значения приводит к нулю', async () => {
        const storage = { estimate: async () => ({}) }

        expect(await getStorageEstimate(storage)).toEqual({ usage: 0, quota: 0 })
    })
})

describe('formatBytes', () => {
    it('переводит в человекочитаемый размер', () => {
        expect(formatBytes(512)).toBe('512 Б')
        expect(formatBytes(2048)).toBe('2.0 КБ')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 МБ')
        expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 ГБ')
    })

    it('мусор превращает в прочерк', () => {
        expect(formatBytes(undefined)).toBe('—')
        expect(formatBytes(-1)).toBe('—')
        expect(formatBytes('много')).toBe('—')
    })
})
