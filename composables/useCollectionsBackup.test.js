import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

const mockDBRef = { current: null }

vi.mock('nuxt/app', () => ({
    useNuxtApp: vi.fn(() => ({
        $indexedDB: mockDBRef.current
    }))
}))

import { useCollectionsBackup, resetCollectionsBackupState } from './useCollectionsBackup'
import { useIndexDB } from './useIndexDB'
import { BACKUP_STORAGE_KEY, buildBackup, readBackupFrom, serializeBackup } from '~/lib/collectionsBackup'
import { sortCollections } from '~/lib/collectionsOrder'

let db = null

/** Кладёт в базу «Избранное» — как это делает плагин при старте. */
const createFavorite = (database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(['collections'], 'readwrite')
    const request = transaction.objectStore('collections').add({
        name: 'Избранное',
        isFavorite: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    })
    request.onsuccess = () => resolve(request.result)
    request.onerror = (event) => reject(event.target.error)
})

describe('useCollectionsBackup', () => {
    beforeEach(async () => {
        db = await global.setupTestDB()
        mockDBRef.current = db
        localStorage.clear()
        // Состояние проверки живёт на уровне модуля
        resetCollectionsBackupState()
    })

    afterEach(() => {
        mockDBRef.current = null
        db = null
        localStorage.clear()
    })

    describe('автокопия при мутациях', () => {
        it('создание подборки попадает в копию', async () => {
            await useIndexDB().createCollection('Пасха')

            const backup = readBackupFrom(localStorage).backup
            expect(backup.collections.map((c) => c.name)).toEqual(['Пасха'])
        })

        it('добавление песни попадает в копию', async () => {
            const id = await useIndexDB().createCollection('Пасха')
            await useIndexDB().addSongToCollection(id, 115, 0)

            const backup = readBackupFrom(localStorage).backup
            expect(backup.links).toHaveLength(1)
            expect(backup.links[0]).toMatchObject({ collectionId: id, songNumber: 115, variantIndex: 0 })
        })

        it('удаление песни отражается в копии', async () => {
            const id = await useIndexDB().createCollection('Пасха')
            await useIndexDB().addSongToCollection(id, 115, 0)
            await useIndexDB().removeSongFromCollection(id, 115, 0)

            expect(readBackupFrom(localStorage).backup.links).toEqual([])
        })

        it('удаление подборки отражается в копии', async () => {
            const id = await useIndexDB().createCollection('Пасха')
            await useIndexDB().addSongToCollection(id, 115, 0)
            await useIndexDB().createCollection('Рождество')

            await useIndexDB().deleteCollection(id)

            const backup = readBackupFrom(localStorage).backup
            expect(backup.collections.map((c) => c.name)).toEqual(['Рождество'])
            expect(backup.links).toEqual([])
        })

        it('избранное попадает в копию с флагом', async () => {
            await createFavorite(db)
            await useIndexDB().addToFavorite(220, 1)

            const backup = readBackupFrom(localStorage).backup
            expect(backup.collections[0].isFavorite).toBe(1)
            expect(backup.links[0]).toMatchObject({ songNumber: 220, variantIndex: 1 })
        })

        it('отказ хранилища не срывает саму операцию', async () => {
            const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('QuotaExceededError')
            })

            const id = await useIndexDB().createCollection('Пасха')
            expect(id).toBeTruthy()

            setItem.mockRestore()
        })

        it('база недоступна — копия не снимается и не падает', async () => {
            mockDBRef.current = null

            expect(await useIndexDB().backupCollections()).toMatchObject({ saved: false })
        })
    })

    describe('checkRestorable', () => {
        it('предлагает восстановление, когда база пуста, а копия есть', async () => {
            localStorage.setItem(
                BACKUP_STORAGE_KEY,
                JSON.stringify(buildBackup(
                    [{ id: 1, name: 'Пасха' }],
                    [{ collectionId: 1, songNumber: 115, variantIndex: 0 }],
                    '2026-08-11T10:00:00.000Z'
                ))
            )

            const backup = await useCollectionsBackup().checkRestorable()
            expect(backup.collections[0].name).toBe('Пасха')
        })

        it('молчит, когда в базе есть свои связи', async () => {
            const id = await useIndexDB().createCollection('Пасха')
            await useIndexDB().addSongToCollection(id, 115, 0)
            resetCollectionsBackupState()

            expect(await useCollectionsBackup().checkRestorable()).toBeNull()
        })

        it('молчит, когда есть пользовательская подборка без песен', async () => {
            await useIndexDB().createCollection('Пасха')
            resetCollectionsBackupState()

            expect(await useCollectionsBackup().checkRestorable()).toBeNull()
        })

        it('пустое «Избранное» восстановлению не мешает', async () => {
            await createFavorite(db)
            localStorage.setItem(
                BACKUP_STORAGE_KEY,
                JSON.stringify(buildBackup(
                    [{ id: 1, name: 'Пасха' }],
                    [{ collectionId: 1, songNumber: 115, variantIndex: 0 }],
                    '2026-08-11T10:00:00.000Z'
                ))
            )
            resetCollectionsBackupState()

            expect(await useCollectionsBackup().checkRestorable()).not.toBeNull()
        })

        it('молчит без копии и на тривиальной копии', async () => {
            expect(await useCollectionsBackup().checkRestorable()).toBeNull()

            resetCollectionsBackupState()
            localStorage.setItem(
                BACKUP_STORAGE_KEY,
                JSON.stringify(buildBackup([{ id: 1, name: 'Избранное', isFavorite: 1 }], [], '2026-08-11T10:00:00.000Z'))
            )

            expect(await useCollectionsBackup().checkRestorable()).toBeNull()
        })

        it('проверяет один раз за сессию', async () => {
            const spy = vi.spyOn(Storage.prototype, 'getItem')

            await useCollectionsBackup().checkRestorable()
            const afterFirst = spy.mock.calls.length
            await useCollectionsBackup().checkRestorable()

            expect(spy.mock.calls.length).toBe(afterFirst)
            spy.mockRestore()
        })
    })

    describe('dismissRestore', () => {
        it('удаляет копию, чтобы не спрашивать снова', async () => {
            await useIndexDB().createCollection('Пасха')

            useCollectionsBackup().dismissRestore()

            expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBeNull()
        })
    })

    describe('applyBackup', () => {
        const backup = buildBackup(
            [
                { id: 1, name: 'Избранное', isFavorite: 1 },
                { id: 2, name: 'Пасха' }
            ],
            [
                { collectionId: 1, songNumber: 115, variantIndex: 0 },
                { collectionId: 2, songNumber: 220, variantIndex: 1 },
                { collectionId: 2, songNumber: 221, variantIndex: 0 }
            ],
            '2026-08-11T10:00:00.000Z'
        )

        it('восстанавливает подборки и связи в пустую базу', async () => {
            await createFavorite(db)

            const result = await useCollectionsBackup().applyBackup(backup)

            expect(result).toEqual({ collections: 1, songs: 3, skipped: 0 })

            const collections = await useIndexDB().getCollections()
            expect(collections.map((c) => c.name).sort()).toEqual(['Избранное', 'Пасха'])

            // «Избранное» слилось с системным, а не продублировалось
            expect(collections.filter((c) => c.name === 'Избранное')).toHaveLength(1)
            expect(await useIndexDB().isSongInFavorite(115, 0)).toBe(true)
        })

        it('существующие связи не дублируются, а считаются пропущенными', async () => {
            await createFavorite(db)
            await useCollectionsBackup().applyBackup(backup)

            const second = await useCollectionsBackup().applyBackup(backup)

            expect(second).toEqual({ collections: 0, songs: 0, skipped: 3 })
            expect(await useIndexDB().getAllLinks()).toHaveLength(3)
        })

        it('песни, добавленные после копии, не удаляются', async () => {
            await createFavorite(db)
            await useIndexDB().addToFavorite(999, 0)

            await useCollectionsBackup().applyBackup(backup)

            const numbers = (await useIndexDB().getAllLinks()).map((link) => link.songNumber).sort((a, b) => a - b)
            expect(numbers).toEqual([115, 220, 221, 999])
        })

        it('без «Избранного» в базе подборка создаётся как обычная', async () => {
            const result = await useCollectionsBackup().applyBackup(backup)

            expect(result.collections).toBe(2)
            expect((await useIndexDB().getCollections()).map((c) => c.name).sort())
                .toEqual(['Избранное', 'Пасха'])
        })
    })

    describe('restoreFromAutoBackup', () => {
        it('восстанавливает из копии в localStorage', async () => {
            localStorage.setItem(
                BACKUP_STORAGE_KEY,
                JSON.stringify(buildBackup(
                    [{ id: 1, name: 'Пасха' }],
                    [{ collectionId: 1, songNumber: 115, variantIndex: 0 }],
                    '2026-08-11T10:00:00.000Z'
                ))
            )

            const result = await useCollectionsBackup().restoreFromAutoBackup()

            expect(result).toEqual({ collections: 1, songs: 1, skipped: 0 })
            expect(await useIndexDB().getAllLinks()).toHaveLength(1)
        })

        it('без копии сообщает об ошибке', async () => {
            await expect(useCollectionsBackup().restoreFromAutoBackup()).rejects.toThrow(/не найдена/)
        })
    })

    describe('exportToText / importFromText', () => {
        it('экспорт и импорт переносят подборки без потерь', async () => {
            const id = await useIndexDB().createCollection('Пасха')
            await useIndexDB().addSongToCollection(id, 115, 0)
            await useIndexDB().addSongToCollection(id, 220, 1)

            const { text, stats } = await useCollectionsBackup().exportToText()
            expect(stats).toMatchObject({ collections: 1, links: 2 })

            // Чистая база — как на другом устройстве
            await global.cleanupTestDB()
            db = await global.setupTestDB()
            mockDBRef.current = db

            const imported = await useCollectionsBackup().importFromText(text)

            expect(imported.ok).toBe(true)
            expect(imported.result).toEqual({ collections: 1, songs: 2, skipped: 0 })

            const restored = await useIndexDB().getCollections()
            expect(restored.map((c) => c.name)).toEqual(['Пасха'])
        })

        it('чужой файл отвергается с понятным текстом', async () => {
            const imported = await useCollectionsBackup().importFromText('{"songs":[]}')

            expect(imported.ok).toBe(false)
            expect(imported.error).toMatch(/не резервная копия/)
            expect(await useIndexDB().getCollections()).toEqual([])
        })

        it('повреждённый файл не меняет базу', async () => {
            const imported = await useCollectionsBackup().importFromText('{сломано')

            expect(imported.ok).toBe(false)
            expect(await useIndexDB().getCollections()).toEqual([])
        })
    })

    describe('порядок подборок и копия', () => {
        /** Копия «как из файла»: только то, что писал бы экспорт. */
        const fileBackup = (collections, links = []) => serializeBackup({
            v: 1,
            savedAt: '2026-08-24T10:00:00.000Z',
            collections,
            links
        })

        it('порядок в копию не входит', async () => {
            // Осознанное решение: восстановление после потери данных важнее
            // переноса расстановки, а новое поле сломало бы формат копии.
            const first = await useIndexDB().createCollection('Пасха')
            const second = await useIndexDB().createCollection('Рождество')
            await useIndexDB().reorderCollections([second, first])

            const backup = readBackupFrom(localStorage).backup

            expect(backup.collections.every((c) => c.order === undefined)).toBe(true)
        })

        it('импортированные подборки получают последовательный order', async () => {
            await useCollectionsBackup().importFromText(fileBackup([
                { id: 1, name: 'Пасха' },
                { id: 2, name: 'Рождество' },
                { id: 3, name: 'Псалмы' }
            ]))

            const restored = await useIndexDB().getCollections()

            expect(restored.map((c) => c.order)).toEqual([0, 1, 2])
        })

        it('копия старого вида без order восстанавливается в порядке записей', async () => {
            // Поля `order` в формате копии не было никогда, поэтому «старая
            // копия» — это ровно текущий формат: порядок задаёт сам файл.
            await useCollectionsBackup().importFromText(fileBackup([
                { id: 7, name: 'Псалмы', createdAt: '2026-01-03T00:00:00.000Z' },
                { id: 3, name: 'Пасха', createdAt: '2026-01-01T00:00:00.000Z' }
            ]))

            const restored = sortCollections(await useIndexDB().getCollections())

            expect(restored.map((c) => c.name)).toEqual(['Псалмы', 'Пасха'])
            // Нумерацию подборки получают заново, из базы, а не из файла
            expect(restored.map((c) => c.order)).toEqual([0, 1])
        })

        it('order из файла в базу не попадает', async () => {
            // Копия от будущей версии или правка руками: чужие номера могли бы
            // столкнуться с уже расставленными и перемешать список.
            await useIndexDB().createCollection('Пасха')
            await useCollectionsBackup().importFromText(fileBackup([
                { id: 1, name: 'Рождество', order: 99 }
            ]))

            const restored = await useIndexDB().getCollections()

            expect(restored.map((c) => ({ name: c.name, order: c.order })))
                .toEqual([{ name: 'Пасха', order: 0 }, { name: 'Рождество', order: 1 }])
        })

        it('импорт продолжает нумерацию, а не спорит с расставленным порядком', async () => {
            const first = await useIndexDB().createCollection('Пасха')
            const second = await useIndexDB().createCollection('Рождество')
            await useIndexDB().reorderCollections([second, first])

            await useCollectionsBackup().importFromText(fileBackup([
                { id: 10, name: 'Псалмы' }
            ]))

            const sorted = sortCollections(await useIndexDB().getCollections())

            // Новая подборка внизу, прежняя расстановка не поехала
            expect(sorted.map((c) => c.name)).toEqual(['Рождество', 'Пасха', 'Псалмы'])
            expect(sorted.map((c) => c.order)).toEqual([0, 1, 2])
        })

        it('слияние по имени порядок существующей подборки не меняет', async () => {
            const first = await useIndexDB().createCollection('Пасха')
            const second = await useIndexDB().createCollection('Рождество')
            await useIndexDB().reorderCollections([second, first])
            const before = await useIndexDB().getCollections()

            await useCollectionsBackup().importFromText(fileBackup(
                [{ id: 1, name: 'Пасха' }],
                [{ collectionId: 1, songNumber: 115, variantIndex: 0 }]
            ))

            const after = await useIndexDB().getCollections()

            expect(before.every((c) => Number.isInteger(c.order))).toBe(true)
            expect(after.map((c) => c.order)).toEqual(before.map((c) => c.order))
            expect(await useIndexDB().getSongsCountInCollection(first)).toBe(1)
        })

        it('восстановление в пустую базу выстраивает подборки без «Избранного»', async () => {
            // После потери данных «Избранное» пересоздаёт плагин — и оно должно
            // встать первым, не споря за `order` с восстановленными.
            await useCollectionsBackup().importFromText(fileBackup([
                { id: 1, name: 'Пасха' },
                { id: 2, name: 'Рождество' }
            ]))
            await createFavorite(db)

            const sorted = sortCollections(await useIndexDB().getCollections())

            expect(sorted.map((c) => c.name)).toEqual(['Избранное', 'Пасха', 'Рождество'])
            expect(sorted.filter((c) => !c.isFavorite).map((c) => c.order)).toEqual([0, 1])
        })
    })
})
