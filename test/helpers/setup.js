import { IDBFactory } from 'fake-indexeddb'

/**
 * Создает mock-экземпляр IndexedDB для тестов
 * Инициализирует схему базы данных (songs, collections, songCollections)
 * @returns {Promise<IDBDatabase>} Mock-экземпляр базы данных
 */
export const createMockDB = async () => {
    const indexedDB = new IDBFactory()
    const dbVersion = 1.1

    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SongsDB', dbVersion)

        request.onupgradeneeded = (event) => {
            const db = event.target.result

            // Создание object store для песен
            if (!db.objectStoreNames.contains('songs')) {
                db.createObjectStore('songs')
            }

            // Создание object store для подборок
            if (!db.objectStoreNames.contains('collections')) {
                const collectionsStore = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true })
                collectionsStore.createIndex('name', 'name', { unique: false })
            }

            // Создание object store для связей песен и подборок
            if (!db.objectStoreNames.contains('songCollections')) {
                const songCollectionsStore = db.createObjectStore('songCollections', { keyPath: 'id', autoIncrement: true })
                songCollectionsStore.createIndex('collectionId', 'collectionId', { unique: false })
                songCollectionsStore.createIndex('songNumber', 'songNumber', { unique: false })
                songCollectionsStore.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: true })
            }
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
