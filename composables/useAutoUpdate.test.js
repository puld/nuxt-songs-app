import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computed } from 'vue'

// Авто-импорты Nuxt: в тестах их нет, подставляем заглушки до импорта
// composable'а. Настройки — простой объект, а не Pinia: проверяется не стор,
// а решения `performCheck`.
const settings = {
    lastUpdateCheck: 0,
    songsEtag: '',
    updateAvailable: false,
    setLastUpdateCheck: vi.fn(),
    setSongsEtag: vi.fn(v => { settings.songsEtag = v }),
    setUpdateAvailable: vi.fn(v => { settings.updateAvailable = v })
}
const songsCount = { current: 1565 }

globalThis.useSettingsStore = () => settings
globalThis.useIndexDB = () => ({ getSongsCount: async () => songsCount.current })
globalThis.useRuntimeConfig = () => ({ app: { baseURL: '/nuxt-songs-app/' } })
globalThis.computed = computed

const { useAutoUpdate } = await import('./useAutoUpdate')

const mockHead = (etag, { ok = true } = {}) => {
    global.fetch = vi.fn(async () => ({
        ok,
        headers: new Map([['etag', etag]])
    }))
}

describe('useAutoUpdate.performCheck', () => {
    beforeEach(() => {
        settings.lastUpdateCheck = 0
        settings.songsEtag = ''
        settings.updateAvailable = false
        songsCount.current = 1565
        vi.clearAllMocks()
    })

    it('запрашивает адрес от baseURL, а не относительный путь', async () => {
        mockHead('"new"')

        await useAutoUpdate().performCheck()

        expect(global.fetch.mock.calls[0][0]).toBe('/nuxt-songs-app/assets/songs.json')
    })

    it('отличие ETag — доступно обновление', async () => {
        settings.songsEtag = '"old"'
        mockHead('"new"')

        await useAutoUpdate().performCheck()

        expect(settings.setUpdateAvailable).toHaveBeenCalledWith(true)
    })

    it('совпадение ETag ничего не меняет', async () => {
        settings.songsEtag = '"same"'
        mockHead('"same"')

        await useAutoUpdate().performCheck()

        expect(settings.setUpdateAvailable).not.toHaveBeenCalled()
        expect(settings.setSongsEtag).not.toHaveBeenCalled()
    })

    // Без этой записи клиент с пустым ETag не узнавал бы об обновлениях
    // никогда: сравнивать не с чем, значит `changed` всегда false, а нового
    // ETag прежде никто не сохранял.
    it('пустой сохранённый ETag запоминается, а не теряется', async () => {
        settings.songsEtag = ''
        mockHead('"first"')

        await useAutoUpdate().performCheck()

        expect(settings.setSongsEtag).toHaveBeenCalledWith('"first"')
        expect(settings.setUpdateAvailable).not.toHaveBeenCalled()
    })

    it('пустая база проверку не запускает — её наполнит плагин', async () => {
        songsCount.current = 0
        mockHead('"new"')

        await useAutoUpdate().performCheck()

        expect(global.fetch).not.toHaveBeenCalled()
    })
})
