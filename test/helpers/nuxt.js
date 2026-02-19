import { vi } from 'vitest'
import { createMockDB, closeDB } from './setup'

let mockNuxtApp = null
let mockDB = null

/**
 * Создает mock для useNuxtApp с fake-indexeddb инстансом
 * @returns {Promise<{db: IDBDatabase, mockNuxtApp: Function}>}
 */
export const setupNuxtWithFakeDB = async () => {
    mockDB = await createMockDB()

    // Создаем hoisted mock функцию для useNuxtApp (синхронно, на верхнем уровне)
    const { useNuxtAppMock } = vi.hoisted(() => {
        return {
            useNuxtAppMock: vi.fn(() => ({
                $indexedDB: mockDB
            }))
        }
    })

    // Мокаем модуль Nuxt до импорта composables
    vi.mock('nuxt/app', () => ({
        useNuxtApp: useNuxtAppMock
    }))

    mockNuxtApp = useNuxtAppMock

    return { db: mockDB, mockNuxtApp }
}

/**
 * Очищает моки Nuxt app и закрывает соединение с DB
 */
export const cleanupNuxtApp = () => {
    if (mockDB) {
        closeDB(mockDB)
        mockDB = null
    }
    if (mockNuxtApp) {
        mockNuxtApp.mockClear?.()
        mockNuxtApp = null
    }
    vi.restoreAllMocks()
}
