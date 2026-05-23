import { useStorage } from '@vueuse/core'

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        fontSize: useStorage('fontSize', 'medium'), // 'small', 'medium', 'large'
        showChords: useStorage('showChords', false),
        keepScreenOn: useStorage('keepScreenOn', true),
        songsEtag: useStorage('songsEtag', ''),
        lastUpdateCheck: useStorage('lastUpdateCheck', 0),
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
        }
    },
    persist: true // Для сохранения настроек между сессиями
})
