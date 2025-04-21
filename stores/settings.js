export const useSettingsStore = defineStore('settings', {
    state: () => ({
        fontSize: 'medium', // 'small', 'medium', 'large'
        showChords: true
    }),
    actions: {
        setFontSize(size) {
            this.fontSize = size
        },
        setShowChords(value) {
            this.showChords = value
        }
    },
    persist: true // Для сохранения настроек между сессиями
})