import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_NAME, DB_VERSION, createSchema } from './dbSchema'
import { runMigrations } from './dbMigrations'

/**
 * Схемы предыдущих версий базы — восстановлены по истории миграций.
 * Нужны, чтобы прогонять апгрейд от лица старого клиента: пользователь может
 * не открывать приложение месяцами и прийти с любой из этих версий.
 *
 * v1 — у песни `body`; связь без варианта, пара (подборка, песня) уникальна.
 * v2 — у песни `variants`; связи те же.
 * v3 — у связи `variantLabel`, уникален ключ с меткой варианта.
 * v4 — у связи `variantIndex` (число); «Избранного» ещё нет.
 * v5 — появились индекс `isFavorite` и подборка «Избранное».
 */
const buildLegacySchema = (db, version) => {
    db.createObjectStore('songs', { keyPath: 'number' })

    const collections = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true })
    collections.createIndex('name', 'name', { unique: false })
    if (version >= 5) {
        collections.createIndex('isFavorite', 'isFavorite', { unique: false })
    }

    const links = db.createObjectStore('songCollections', { keyPath: 'id', autoIncrement: true })
    links.createIndex('collectionId', 'collectionId', { unique: false })
    links.createIndex('songNumber', 'songNumber', { unique: false })
    // До v3 пара (подборка, песня) была уникальной — вариант в ключ не входил
    links.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: version < 3 })

    if (version === 3) {
        links.createIndex('collectionId_songNumber_variantLabel', ['collectionId', 'songNumber', 'variantLabel'], { unique: true })
    }
    if (version >= 4) {
        links.createIndex('collectionId_songNumber_variantIndex', ['collectionId', 'songNumber', 'variantIndex'], { unique: true })
    }
}

/** Данные, которые старый клиент держал в базе к моменту апгрейда. */
const legacyFixture = (version) => {
    const song = version < 2
        ? { number: 115, title: 'Тихий свет', body: [{ id: 1, n: 1, type: 'verse', content: 'первый куплет' }] }
        : { number: 115, title: 'Тихий свет', variants: [{ label: '', body: [{ id: 1, n: 1, type: 'verse', content: 'первый куплет' }] }] }

    const collections = [
        { id: 1, name: 'Молодёжное служение', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
        { id: 2, name: 'Псалмы на разбор', createdAt: '2025-02-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z' }
    ]
    if (version >= 5) {
        collections.push({ id: 3, name: 'Избранное', isFavorite: 1, createdAt: '2025-03-01T00:00:00.000Z', updatedAt: '2025-03-01T00:00:00.000Z' })
    }

    const baseLink = { collectionId: 1, songNumber: 115, addedAt: '2025-01-01T00:00:00.000Z' }
    let links
    if (version < 3) {
        links = [baseLink, { collectionId: 2, songNumber: 220, addedAt: '2025-01-01T00:00:00.000Z' }]
    } else if (version === 3) {
        links = [
            { ...baseLink, variantLabel: '' },
            { collectionId: 2, songNumber: 220, variantLabel: 'а', addedAt: '2025-01-01T00:00:00.000Z' }
        ]
    } else {
        links = [
            { ...baseLink, variantIndex: 0 },
            { collectionId: 2, songNumber: 220, variantIndex: 1, addedAt: '2025-01-01T00:00:00.000Z' }
        ]
    }

    return { songs: [song], collections, links }
}

/** Поднимает базу в схеме указанной старой версии и наполняет её данными. */
const openLegacy = async (indexedDB, version, data = legacyFixture(version)) => {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version)
        request.onupgradeneeded = (event) => buildLegacySchema(event.target.result, version)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

    if (data.songs?.length) await putAll(db, 'songs', data.songs)
    if (data.collections?.length) await putAll(db, 'collections', data.collections)
    if (data.links?.length) await putAll(db, 'songCollections', data.links)

    db.close()
    return data
}

/** Кладёт записи в хранилище, дожидаясь завершения транзакции. */
const putAll = (db, storeName, records) =>
    new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)
        records.forEach((record) => store.put(record))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
    })

/** Открывает базу целевой версии так же, как это делает плагин. */
const upgradeToCurrent = (indexedDB, version = DB_VERSION) =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version)
        request.onupgradeneeded = (event) => {
            createSchema(event.target.result)
            runMigrations(event.target.result, event.target.transaction, event.oldVersion)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('апгрейд заблокирован'))
    })

/** Читает всё содержимое хранилища. */
const getAll = (db, storeName) =>
    new Promise((resolve, reject) => {
        const request = db.transaction([storeName], 'readonly').objectStore(storeName).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

/**
 * Пробует добавить связь так же, как `useIndexDB.addSongToCollection`.
 * Возвращает `true`, если уникальный индекс пропустил запись.
 */
const tryAddLink = (db, collectionId, songNumber, variantIndex) =>
    new Promise((resolve) => {
        const transaction = db.transaction(['songCollections'], 'readwrite')
        const request = transaction.objectStore('songCollections').add({
            collectionId, songNumber, variantIndex, addedAt: new Date().toISOString()
        })
        request.onsuccess = () => resolve(true)
        // Нарушение уникальности приходит сюда и абортит транзакцию —
        // гасим событие, чтобы оно не всплыло необработанной ошибкой
        request.onerror = (event) => {
            event.preventDefault()
            resolve(false)
        }
        transaction.onabort = () => resolve(false)
    })

const LEGACY_VERSIONS = [1, 2, 3, 4, 5]

describe('runMigrations: апгрейд старых клиентов', () => {
    // Главный сценарий: клиент приходит с произвольной старой версии.
    // Симптом бага, из-за которого всё затевалось, — пропавшие подборки
    // с названиями, поэтому проверяем именно сохранность подборок и связей.
    it.each(LEGACY_VERSIONS)('с v%i база открывается, подборки и связи целы', async (version) => {
        const indexedDB = new IDBFactory()
        const fixture = await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')
        const links = await getAll(db, 'songCollections')

        const names = collections.map((item) => item.name).sort()
        expect(names).toContain('Молодёжное служение')
        expect(names).toContain('Псалмы на разбор')
        expect(links).toHaveLength(fixture.links.length)
        expect(links.map((link) => link.songNumber).sort()).toEqual([115, 220])
        db.close()
    })

    it.each(LEGACY_VERSIONS)('с v%i связи получают числовой variantIndex', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const links = await getAll(db, 'songCollections')

        expect(links.every((link) => Number.isInteger(link.variantIndex))).toBe(true)
        expect(links.every((link) => !('variantLabel' in link))).toBe(true)
        db.close()
    })

    it.each(LEGACY_VERSIONS)('с v%i «Избранное» есть ровно одно', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')

        expect(collections.filter((item) => item.isFavorite === 1)).toHaveLength(1)
        db.close()
    })

    it.each(LEGACY_VERSIONS)('с v%i индексы приведены к целевой схеме', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const links = db.transaction(['songCollections'], 'readonly').objectStore('songCollections')
        const collections = db.transaction(['collections'], 'readonly').objectStore('collections')

        expect([...links.indexNames].sort()).toEqual([
            'collectionId',
            'collectionId_songNumber',
            'collectionId_songNumber_variantIndex',
            'songNumber'
        ])
        expect(links.index('collectionId_songNumber_variantIndex').unique).toBe(true)
        expect(links.index('collectionId_songNumber').unique).toBe(false)
        expect([...collections.indexNames].sort()).toEqual(['isFavorite', 'name'])
        db.close()
    })

    it.each(LEGACY_VERSIONS)('после апгрейда с v%i в подборку можно добавить второй вариант песни', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        // Уникальный индекс должен пропустить другой вариант той же песни
        expect(await tryAddLink(db, 1, 115, 1)).toBe(true)
        // ...и не пропустить точный дубликат
        expect(await tryAddLink(db, 1, 115, 0)).toBe(false)
        db.close()
    })

    it('апгрейд с v3 не падает, когда песня лежит в подборке в двух вариантах', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 3, {
            collections: [{ id: 1, name: 'Служение', createdAt: '2025-01-01T00:00:00.000Z' }],
            // До v4 ключ включал метку варианта — две такие записи были законны,
            // и именно они роняли создание уникального индекса по variantIndex
            links: [
                { id: 1, collectionId: 1, songNumber: 115, variantLabel: 'а', addedAt: '2025-01-01T00:00:00.000Z' },
                { id: 2, collectionId: 1, songNumber: 115, variantLabel: 'б', addedAt: '2025-01-02T00:00:00.000Z' }
            ]
        })

        const db = await upgradeToCurrent(indexedDB)
        const links = await getAll(db, 'songCollections')

        // Обе связи на месте: дубликат разведён на свободный variantIndex, а не удалён
        expect(links).toHaveLength(2)
        expect(links.map((link) => link.variantIndex).sort()).toEqual([0, 1])
        expect(links.every((link) => link.songNumber === 115 && link.collectionId === 1)).toBe(true)
        db.close()
    })

    it('апгрейд с v3 разводит три варианта одной песни на разные индексы', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 3, {
            collections: [{ id: 1, name: 'Служение', createdAt: '2025-01-01T00:00:00.000Z' }],
            links: ['а', 'б', 'в'].map((variantLabel, index) => ({
                id: index + 1, collectionId: 1, songNumber: 115, variantLabel, addedAt: '2025-01-01T00:00:00.000Z'
            }))
        })

        const db = await upgradeToCurrent(indexedDB)
        const links = await getAll(db, 'songCollections')

        expect(links.map((link) => link.variantIndex).sort()).toEqual([0, 1, 2])
        db.close()
    })

    it('апгрейд с v1 переводит body в variants, не теряя песен', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 1, {
            songs: [
                { number: 1, title: 'Первая', body: [{ id: 1, n: 1, type: 'verse', content: 'текст' }] },
                { number: 2, title: 'Вторая', body: [{ id: 1, n: 1, type: 'verse', content: 'другой' }] }
            ]
        })

        const db = await upgradeToCurrent(indexedDB)
        const songs = await getAll(db, 'songs')

        expect(songs).toHaveLength(2)
        expect(songs[0].variants).toEqual([{ label: '', body: [{ id: 1, n: 1, type: 'verse', content: 'текст' }] }])
        expect(songs[0].body).toBeUndefined()
        db.close()
    })

    it('песни с variants при апгрейде с v2 не переписываются', async () => {
        const indexedDB = new IDBFactory()
        const fixture = await openLegacy(indexedDB, 2)

        const db = await upgradeToCurrent(indexedDB)
        const songs = await getAll(db, 'songs')

        expect(songs[0]).toEqual(fixture.songs[0])
        db.close()
    })

    it('существующее «Избранное» при апгрейде с v5 не дублируется и сохраняет id', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 5)

        const db = await upgradeToCurrent(indexedDB)
        const favorites = (await getAll(db, 'collections')).filter((item) => item.isFavorite === 1)

        expect(favorites).toHaveLength(1)
        // id важен: на него ссылаются связи в songCollections
        expect(favorites[0].id).toBe(3)
        db.close()
    })

    it('битые связи без номера песни удаляются, целые остаются', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 3, {
            links: [
                { id: 1, collectionId: 1, songNumber: 115, variantLabel: '', addedAt: '2025-01-01T00:00:00.000Z' },
                { id: 2, collectionId: 1, songNumber: null, variantLabel: 'x', addedAt: '2025-01-01T00:00:00.000Z' }
            ]
        })

        const db = await upgradeToCurrent(indexedDB)
        const links = await getAll(db, 'songCollections')

        expect(links).toHaveLength(1)
        expect(links[0].songNumber).toBe(115)
        db.close()
    })

    it('связи без addedAt получают дату, а не остаются без неё', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 3, {
            links: [{ id: 1, collectionId: 1, songNumber: 115, variantLabel: '' }]
        })

        const db = await upgradeToCurrent(indexedDB)
        const links = await getAll(db, 'songCollections')

        expect(typeof links[0].addedAt).toBe('string')
        expect(Number.isNaN(Date.parse(links[0].addedAt))).toBe(false)
        db.close()
    })

    it('апгрейд переносит большую базу связей целиком', async () => {
        const indexedDB = new IDBFactory()
        // 200 связей в четырёх подборках — на порядок больше реальной нагрузки
        const links = Array.from({ length: 200 }, (_, index) => ({
            id: index + 1,
            collectionId: (index % 4) + 1,
            songNumber: index + 1,
            variantLabel: '',
            addedAt: '2025-01-01T00:00:00.000Z'
        }))
        await openLegacy(indexedDB, 3, { links })

        const db = await upgradeToCurrent(indexedDB)
        const migrated = await getAll(db, 'songCollections')

        expect(migrated).toHaveLength(200)
        expect(new Set(migrated.map((link) => link.songNumber)).size).toBe(200)
        db.close()
    })

    it('повторный апгрейд на уже мигрированной базе проходит без потерь', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 3, {
            links: [{ id: 1, collectionId: 1, songNumber: 115, variantLabel: '', addedAt: '2025-01-01T00:00:00.000Z' }]
        })

        const first = await upgradeToCurrent(indexedDB)
        first.close()

        // Ещё один апгрейд поверх текущей схемы — шаги должны быть идемпотентны
        const second = await upgradeToCurrent(indexedDB, DB_VERSION + 1)
        const links = await getAll(second, 'songCollections')

        expect(links).toHaveLength(1)
        expect(links[0].variantIndex).toBe(0)
        second.close()
    })

    it('апгрейд со старой версии создаёт хранилище разделов', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 5)

        const db = await upgradeToCurrent(indexedDB)

        // Разделы появились в схеме позже песен: у обновившегося клиента
        // хранилища не было вовсе, и без него страница «Все песни» падала бы
        expect([...db.objectStoreNames]).toContain('sections')
        expect(await getAll(db, 'sections')).toEqual([])
        db.close()
    })

    it('на свежей базе (oldVersion 0) миграции не выполняются', async () => {
        const indexedDB = new IDBFactory()
        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')

        // createSchema создал хранилища, но «Избранное» на новой базе заводит
        // плагин, а не миграции: шаги при oldVersion 0 не запускаются
        expect(collections).toHaveLength(0)
        db.close()
    })
})

describe('runMigrations: порядок подборок', () => {
    // Поле `order` появилось в v8. У обновившегося клиента его нет ни у одной
    // подборки, а сайдбар сортирует по нему — без простановки список
    // выстроился бы по дате создания даже после ручной перестановки.
    it.each(LEGACY_VERSIONS)('с v%i все подборки получают числовой order', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')

        expect(collections.every((item) => Number.isInteger(item.order))).toBe(true)
        // Порядок сплошной, без дыр и повторов
        expect(collections.map((item) => item.order).sort((a, b) => a - b))
            .toEqual(collections.map((_, index) => index))
        db.close()
    })

    it.each(LEGACY_VERSIONS)('с v%i «Избранное» получает нулевой order', async (version) => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, version)

        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')
        const favorite = collections.find((item) => item.isFavorite)

        expect(favorite.order).toBe(0)
        db.close()
    })

    it('порядок берётся текущий — по дате создания, а не по id или имени', async () => {
        const indexedDB = new IDBFactory()
        // Названия и id намеренно вразрез с датами: «Ранняя» создана раньше,
        // но лежит вторым id — она и должна оказаться выше.
        await openLegacy(indexedDB, 5, {
            songs: [],
            collections: [
                { id: 1, name: 'Поздняя', createdAt: '2025-05-01T00:00:00.000Z', updatedAt: '2025-05-01T00:00:00.000Z' },
                { id: 2, name: 'Ранняя', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
                { id: 3, name: 'Избранное', isFavorite: 1, createdAt: '2025-03-01T00:00:00.000Z', updatedAt: '2025-03-01T00:00:00.000Z' }
            ],
            links: []
        })

        const db = await upgradeToCurrent(indexedDB)
        const collections = await getAll(db, 'collections')
        const byOrder = collections.sort((a, b) => a.order - b.order).map((item) => item.name)

        expect(byOrder).toEqual(['Избранное', 'Ранняя', 'Поздняя'])
        db.close()
    })

    it('повторный апгрейд не переставляет подборки, выстроенные пользователем', async () => {
        const indexedDB = new IDBFactory()
        await openLegacy(indexedDB, 5)

        const first = await upgradeToCurrent(indexedDB)
        const collections = await getAll(first, 'collections')

        // Пользователь поднял «Псалмы на разбор» на второе место
        const favorite = collections.find((item) => item.isFavorite)
        const psalms = collections.find((item) => item.name === 'Псалмы на разбор')
        const youth = collections.find((item) => item.name === 'Молодёжное служение')
        await putAll(first, 'collections', [
            { ...favorite, order: 0 },
            { ...psalms, order: 1 },
            { ...youth, order: 2 }
        ])
        first.close()

        const second = await upgradeToCurrent(indexedDB, DB_VERSION + 1)
        const after = await getAll(second, 'collections')
        const byOrder = after.sort((a, b) => a.order - b.order).map((item) => item.name)

        expect(byOrder).toEqual(['Избранное', 'Псалмы на разбор', 'Молодёжное служение'])
        second.close()
    })
})
