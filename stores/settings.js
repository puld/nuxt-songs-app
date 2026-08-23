import { useStorage } from '@vueuse/core'
import { DEFAULT_SONGS_LIST_MODE, normalizeSongsListMode } from '~/lib/songsList'

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        fontSize: useStorage('fontSize', 'medium'), // 'small', 'medium', 'large'
        showChords: useStorage('showChords', false),
        keepScreenOn: useStorage('keepScreenOn', true),
        songsEtag: useStorage('songsEtag', ''),
        lastUpdateCheck: useStorage('lastUpdateCheck', 0),
        devMode: useStorage('devMode', false), // режим разработчика: гейт экспериментальных функций
        // Режим группировки на «Все песни»: у каждого свой способ искать песню,
        // и выбирать его заново при каждом заходе незачем
        songsListMode: useStorage('songsListMode', DEFAULT_SONGS_LIST_MODE),
        updateAvailable: false // не персистентно — пересчитывается при каждом запуске
    }),
    actions: {
        setFontSize(size) {
            this.fontSize = size
        },
        setShowChords(value) {
            this.showChords = value
        },
        setKeepScreenOn(value) {
            this.keepScreenOn = value
        },
        setSongsEtag(etag) {
            this.songsEtag = etag
        },
        setLastUpdateCheck(timestamp) {
            this.lastUpdateCheck = timestamp
        },
        setUpdateAvailable(value) {
            this.updateAvailable = value
        },
        setDevMode(value) {
            this.devMode = value
        },
        setSongsListMode(mode) {
            this.songsListMode = normalizeSongsListMode(mode)
        }
    },
    persist: true // Для сохранения настроек между сессиями
})
