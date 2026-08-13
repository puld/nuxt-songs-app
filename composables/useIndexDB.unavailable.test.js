import { describe, it, expect, vi } from 'vitest'

// База недоступна: плагин провайдит null, если открыть её не удалось
const mockDBRef = { current: null }

vi.mock('nuxt/app', () => ({
    useNuxtApp: vi.fn(() => ({
        $indexedDB: mockDBRef.current
    }))
}))

import { useIndexDB } from './useIndexDB'

describe('useIndexDB при недоступной базе', () => {
    it('чтения возвращают пустой результат вместо ошибки', async () => {
        const db = useIndexDB()

        // Экраны должны показать «пусто», а не упасть: причина отказа видна
        // в блоке диагностики на /about
        expect(await db.getAllSongs()).toEqual([])
        expect(await db.getCollections()).toEqual([])
        expect(await db.getSongNumbers()).toEqual([])
        expect(await db.getSongsInCollection(1)).toEqual([])
        expect(await db.getCollectionsForSong(115)).toEqual([])
        expect(await db.getAvailableCollections(115)).toEqual([])
        expect(await db.getSongsCount()).toBe(0)
        expect(await db.getSongsCountInCollection(1)).toBe(0)
        expect(await db.getSong(115)).toBeNull()
        expect(await db.getCollection(1)).toBeNull()
        expect(await db.getFavoriteCollection()).toBeNull()
        expect(await db.isSongInFavorite(115)).toBe(false)
    })

    it('записи отклоняются с понятной ошибкой', async () => {
        const db = useIndexDB()

        await expect(db.createCollection('Тест')).rejects.toThrow('База данных недоступна')
        await expect(db.addSongToCollection(1, 115)).rejects.toThrow('База данных недоступна')
        await expect(db.removeSongFromCollection(1, 115)).rejects.toThrow('База данных недоступна')
        await expect(db.deleteCollection(1)).rejects.toThrow('База данных недоступна')
        await expect(db.addToFavorite(115)).rejects.toThrow('База данных недоступна')
        await expect(db.removeFromFavorite(115)).rejects.toThrow('База данных недоступна')
        await expect(db.addSongs([])).rejects.toThrow('База данных недоступна')
    })
})
