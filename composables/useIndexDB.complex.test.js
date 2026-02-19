import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import songsData from '../test/fixtures/songs.json'

// Создаем переменные для mock-ов
const mockDBRef = { current: null }

// Мокаем модуль Nuxt до импорта composables
vi.mock('nuxt/app', () => ({
    useNuxtApp: vi.fn(() => ({
        $indexedDB: mockDBRef.current
    }))
}))

// Импортируем composables после vi.mock
import { useIndexDB } from './useIndexDB'

let db = null
let createCollection = null

describe('useIndexDB - сложные операции (fake-indexeddb)', () => {
    beforeEach(async () => {
        db = await global.setupTestDB()
        mockDBRef.current = db
        createCollection = useIndexDB().createCollection
    })

    afterEach(() => {
        mockDBRef.current = null
        createCollection = null
    })

    describe('addSongs', () => {
        it('должен успешно загружать массив песен', async () => {
            const {addSongs} = useIndexDB()

            await expect(addSongs(songsData)).resolves.not.toThrow()

            // Проверяем что песни сохранены в базе
            const transaction = db.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAll()

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve([])
            })

            expect(request.result).toEqual(songsData)
            expect(request.result).toHaveLength(5)
        })

        it('должен очишать хранилище перед добавлением', async () => {
            const {addSongs} = useIndexDB()

            // Первая загрузка
            await addSongs(songsData.slice(0, 2))

            // Вторая загрузка (должна заменить)
            await addSongs(songsData.slice(2, 4))

            const transaction = db.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAll()

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve([])
            })

            // Должны быть только 2 песни из второй загрузки
            expect(request.result).toHaveLength(2)
        })

        it('должен нормализовывать типы данных (строки в числа)', async () => {
            const stringSongs = [
                {
                    number: '1',
                    title: 'Песня',
                    body: [{type: 'verse', content: 'Текст'}]
                }
            ]

            const {addSongs} = useIndexDB()

            await addSongs(stringSongs)

            const transaction = db.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.get(1)

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve(null)
            })

            expect(request.result.number).toBe(1) // должно быть числом, не строкой
        })

        it('должен обрабатывать пустой массив песен', async () => {
            const {addSongs} = useIndexDB()

            await expect(addSongs([])).resolves.not.toThrow()

            const transaction = db.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAll()

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve([])
            })

            expect(request.result).toEqual([])
        })

        it('должен выбрасывать TypeError при неверном типе данных', async () => {
            const {addSongs} = useIndexDB()

            await expect(addSongs(null)).rejects.toThrow()
            await expect(addSongs(undefined)).rejects.toThrow()
        })

        it('должен успешно создавать подборку', async () => {
            const {createCollection} = useIndexDB()

            const collectionId = await createCollection('Моя подборка')

            expect(collectionId).toBeDefined()
            expect(typeof collectionId).toBe('number')
        })

        it('должен создавать несколько подборок', async () => {
            const {createCollection} = useIndexDB()

            const id1 = await createCollection('Подборка 1')
            const id2 = await createCollection('Подборка 2')
            const id3 = await createCollection('Подборка 3')

            expect(id1).not.toBe(id2)
            expect(id2).not.toBe(id3)
            expect(id1).toBeGreaterThan(0)
        })

        it('должен возвращать все подборки', async () => {
            // Сначала создадим подборки
            await createCollection('Подборка А')
            await createCollection('Подборка Б')
            await createCollection('Подборка В')

            const {getCollections} = useIndexDB()

            const collections = await getCollections()

            expect(collections).toHaveLength(3)
            expect(collections[0]).toHaveProperty('id')
            expect(collections[0]).toHaveProperty('name')
        })

        it('должен возвращать пустой массив при отсутствии подборок', async () => {
            const {getCollections} = useIndexDB()

            const collections = await getCollections()

            expect(collections).toEqual([])
        })

        it('должен успешно удалять подборку', async () => {
            // Сначала создадим подборку
            const collectionId = await createCollection('Удаляемая подборка')

            const {deleteCollection} = useIndexDB()

            await deleteCollection(collectionId)

            // Проверяем что подборка удалена
            const getTx = db.transaction(['collections'], 'readonly')
            const getStore = getTx.objectStore('collections')
            const request = getStore.get(collectionId)

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve(null)
            })

            expect(request.result).toBeNull()
        })

        it('должен удалять все связи с песнями', async () => {
            // Сначала создадим подборку
            const collectionId = await createCollection('Тест для удаления связей')

            // Добавим песню
            const tx1 = db.transaction(['songCollections'], 'readwrite')
            const store1 = tx1.objectStore('songCollections')
            await store1.add({collectionId, songNumber: 10, addedAt: new Date().toISOString()})
            await tx1.oncomplete

            const {addSongToCollection} = useIndexDB()
            await addSongToCollection(collectionId, 20)

            // Удаляем подборку
            const {deleteCollection} = useIndexDB()
            await deleteCollection(collectionId)

            // Проверяем что связи удалены
            const tx2 = db.transaction(['songCollections'], 'readonly')
            const store2 = tx2.objectStore('songCollections')
            const index = store2.index('collectionId')
            const request = index.getAll(collectionId)

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve(null)
            })

            expect(request.result).toHaveLength(0)
        })

        it('должен успешно добавлять песню в подборку', async () => {
            const {addSongToCollection} = useIndexDB()

            const collectionId = await createCollection('Тест добавления')

            await addSongToCollection(collectionId, 10)

            const getTx = db.transaction(['songCollections'], 'readonly')
            const store = getTx.objectStore('songCollections')
            const request = store.getAll(collectionId)

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve(null)
            })

            expect(request.result).toHaveLength(1)
            expect(request.result[0].songNumber).toBe(10)
        })

        it('должен нормализовывать типы данных', async () => {
            const {addSongToCollection} = useIndexDB()

            const stringN = '20'

            await addSongToCollection(1, stringId)

            const getTx = db.transaction(['songCollections'], 'readonly')
            const getStore = getTx.objectStore('songCollections')
            const index = getStore.index('collectionId_songNumber')
            const request = index.get([1, stringId])

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve(null)
            })

            expect(request.result.collectionId).toBe(1)
            expect(request.result.songNumber).toBe(20)
        })

        it('должен выбрасывать ошибку при добавлении дубликата', async () => {
            const {addSongToCollection} = useIndexDB()

            // Сначала создадим подборку
            const collectionId = await createCollection('Тест дубликата')

            // Добавляем песню
            await addSongToCollection(collectionId, 10)

            // Пытка добавить ту же песню - должна выбросить ошибку
            await expect(addSongToCollection(collectionId, 10)).rejects.toThrow('Песня уже есть в этой подборке')
        })

        it('должен успешно создавать подборку с пустым именем', async () => {
            const {createCollection} = useIndexDB()

            await expect(createCollection('')).resolves.not.toThrow()
        })

        it('должен создавать подборки с одинаковыми названиями', async () => {
            const {createCollection} = useIndexDB()

            const id1 = await createCollection('Подборка 1')
            const id2 = await createCollection('Подборка 1')

            expect(id1).not.toBe(id2) // должны быть разными ID
        })

        it('должен успешно загружать массив песен', async () => {
            const {addSongs} = useIndexDB()

            await expect(addSongs(songsData)).resolves.not.toThrow()

            const transaction = db.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAll()

            await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => resolve([])
            })

            expect(request.result).toEqual(songsData)
            expect(request.result).toHaveLength(5)
        })
    })
})
