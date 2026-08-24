/**
 * Единый источник схемы IndexedDB: имя базы, версия и создание хранилищ.
 *
 * Используется и боевым плагином (`plugins/indexedDB.client.js`), и тестовыми
 * хелперами (`test/helpers/setup.js`). Раньше схема была скопирована в оба
 * места, и тесты могли проверять структуру, отличную от боевой.
 *
 * Миграции здесь НЕ живут: они зависят от `oldVersion` и работают с
 * транзакцией апгрейда, поэтому остаются в плагине. Тесты поднимают базу
 * с нуля, где миграции не выполняются.
 */

export const DB_NAME = 'SongsDB'

/**
 * Версия схемы. При изменении структуры увеличивать здесь — это единственное
 * место, откуда её берут и приложение, и тесты.
 */
export const DB_VERSION = 8

/**
 * Создаёт отсутствующие хранилища и их индексы.
 * Идемпотентна: существующие хранилища не трогает, поэтому безопасна
 * и на свежей базе, и внутри апгрейда.
 *
 * @param {IDBDatabase} db - база в состоянии onupgradeneeded
 */
export const createSchema = (db) => {
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'number' })
    }

    // Поле `order` (порядок в сайдбаре) индекса не имеет: подборок единицы,
    // сортировка идёт в памяти чистой функцией из `lib/collectionsOrder.js`.
    if (!db.objectStoreNames.contains('collections')) {
        const collectionsStore = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true })
        collectionsStore.createIndex('name', 'name', { unique: false })
        collectionsStore.createIndex('isFavorite', 'isFavorite', { unique: false })
    }

    // Разделы сборника: нужны странице «Все песни» для группировки по разделам.
    // Лежат в базе рядом с песнями, а не отдельным файлом, чтобы оффлайн-источник
    // остался единственным: и то и другое приходит из одного `songs.json`.
    if (!db.objectStoreNames.contains('sections')) {
        db.createObjectStore('sections', { keyPath: 'id' })
    }

    if (!db.objectStoreNames.contains('songCollections')) {
        const songCollectionsStore = db.createObjectStore('songCollections', { keyPath: 'id', autoIncrement: true })
        songCollectionsStore.createIndex('collectionId', 'collectionId', { unique: false })
        songCollectionsStore.createIndex('songNumber', 'songNumber', { unique: false })
        songCollectionsStore.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: false })
        songCollectionsStore.createIndex('collectionId_songNumber_variantIndex', ['collectionId', 'songNumber', 'variantIndex'], { unique: true })
    }
}
