import { useStorage } from '@vueuse/core'

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        fontSize: useStorage('fontSize', 'medium'), // 'small', 'medium', 'large'
        showChords: useStorage('showChords', false),
        keepScreenOn: useStorage('keepScreenOn', true)
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
        }
    },
    persist: true // Для сохранения настроек между сессиями
})