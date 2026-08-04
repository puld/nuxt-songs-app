import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_NAME, DB_VERSION, createSchema } from './dbSchema'

/**
 * Поднимает базу с нуля, применяя createSchema в onupgradeneeded.
 * @param {number} version - версия базы
 * @returns {Promise<IDBDatabase>}
 */
const openWithSchema = (indexedDB, version = DB_VERSION) =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version)
        request.onupgradeneeded = (event) => createSchema(event.target.result)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

describe('dbSchema', () => {
    it('версия базы — целое число больше нуля', () => {
        expect(Number.isInteger(DB_VERSION)).toBe(true)
        expect(DB_VERSION).toBeGreaterThan(0)
    })

    it('createSchema создаёт три хранилища', async () => {
        const db = await openWithSchema(new IDBFactory())

        expect([...db.objectStoreNames].sort()).toEqual(['collections', 'songCollections', 'songs'])
        db.close()
    })

    it('songs использует number как keyPath', async () => {
        const db = await openWithSchema(new IDBFactory())
        const store = db.transaction(['songs'], 'readonly').objectStore('songs')

        expect(store.keyPath).toBe('number')
        db.close()
    })

    it('collections имеет индексы name и isFavorite', async () => {
        const db = await openWithSchema(new IDBFactory())
        const store = db.transaction(['collections'], 'readonly').objectStore('collections')

        expect([...store.indexNames].sort()).toEqual(['isFavorite', 'name'])
        db.close()
    })

    it('songCollections имеет все четыре индекса', async () => {
        const db = await openWithSchema(new IDBFactory())
        const store = db.transaction(['songCollections'], 'readonly').objectStore('songCollections')

        expect([...store.indexNames].sort()).toEqual([
            'collectionId',
            'collectionId_songNumber',
            'collectionId_songNumber_variantIndex',
            'songNumber',
        ])
        db.close()
    })

    it('составной индекс с variantIndex уникален, с songNumber — нет', async () => {
        const db = await openWithSchema(new IDBFactory())
        const store = db.transaction(['songCollections'], 'readonly').objectStore('songCollections')

        expect(store.index('collectionId_songNumber_variantIndex').unique).toBe(true)
        expect(store.index('collectionId_songNumber').unique).toBe(false)
        db.close()
    })

    it('идемпотентна: повторный вызов на существующих хранилищах не падает', async () => {
        const indexedDB = new IDBFactory()

        const first = await openWithSchema(indexedDB, DB_VERSION)
        first.close()

        // Повышаем версию — createSchema снова вызывается на той же базе
        const second = await openWithSchema(indexedDB, DB_VERSION + 1)

        expect([...second.objectStoreNames].sort()).toEqual(['collections', 'songCollections', 'songs'])
        second.close()
    })
})
