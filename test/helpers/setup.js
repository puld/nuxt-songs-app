import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { DB_NAME, DB_VERSION, createSchema } from '../../lib/dbSchema'

/**
 * Создает mock-экземпляр IndexedDB для тестов.
 * Схему берём из lib/dbSchema.js — та же, что использует боевой плагин,
 * иначе тесты проверяли бы структуру, отличную от реальной.
 * @returns {Promise<IDBDatabase>} Mock-экземпляр базы данных
 */
export const createMockDB = async () => {
    // Делаем IDBKeyRange доступным глобально для fake-indexeddb
    if (typeof globalThis.IDBKeyRange === 'undefined') {
        globalThis.IDBKeyRange = IDBKeyRange
    }

    const indexedDB = new IDBFactory()

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            createSchema(event.target.result)
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

/**
 * Закрывает соединение с базой данных
 * @param {IDBDatabase} db - Экземпляр базы данных
 */
export const closeDB = (db) => {
    if (db) {
        db.close()
    }
}
