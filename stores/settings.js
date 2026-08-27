import { useStorage } from '@vueuse/core'
import { DEFAULT_SONGS_LIST_MODE, normalizeSongsListMode } from '~/lib/songsList'
import { addRecent, normalizeRecent } from '~/lib/recentSongs'
import { normalizeSongsVersion, DEFAULT_SONGS_VERSION } from '~/lib/songsVersion'

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        fontSize: useStorage('fontSize', 'medium'), // 'small', 'medium', 'large'
        showChords: useStorage('showChords', false),
        // Прятать басовую часть аккорда (`G/B` → `G`): обращения нужны
        // аккомпаниатору, а поющему по бумажке только мешают читать
        hideChordBass: useStorage('hideChordBass', false),
        keepScreenOn: useStorage('keepScreenOn', true),
        songsEtag: useStorage('songsEtag', ''),
        // Версия базы песен из корня songs.json — по ней ссылка на подборку
        // понимает, что у получателя база старее, чем у отправителя
        songsVersion: useStorage('songsVersion', DEFAULT_SONGS_VERSION),
        lastUpdateCheck: useStorage('lastUpdateCheck', 0),
        devMode: useStorage('devMode', false), // режим разработчика: гейт экспериментальных функций
        // Режим группировки на «Все песни»: у каждого свой способ искать песню,
        // и выбирать его заново при каждом заходе незачем
        songsListMode: useStorage('songsListMode', DEFAULT_SONGS_LIST_MODE),
        // Недавно открытые песни, свежая первой. Здесь, а не в IndexedDB:
        // список короткий, и потеря истории просмотров ничего не стоит
        recentSongs: useStorage('recentSongs', []),
        updateAvailable: false // не персистентно — пересчитывается при каждом запуске
    }),
    getters: {
        // Значение из localStorage может быть любым — нормализуем при чтении,
        // чтобы мусор не ушёл в шаблон пустыми ссылками
        recentSongNumbers: (state) => normalizeRecent(state.recentSongs),
        // Значение лежит в localStorage и может оказаться мусором, а на нём
        // держится сравнение версий при импорте подборки
        currentSongsVersion: (state) => normalizeSongsVersion(state.songsVersion),
        // Аккорды показываются только в режиме разработчика: размечена малая
        // часть сборника, и обычному читателю аккорды попадались бы через раз.
        // Гейт стоит здесь, а не только на тумблере в настройках: тумблер был
        // доступен всем, и у кого-то showChords остался включённым
        chordsVisible: (state) => state.devMode && state.showChords,
        // Упрощение считается только там, где аккорды вообще видны: иначе
        // настройка жила бы своей жизнью и всплывала при включении показа
        chordBassHidden() {
            return this.chordsVisible && this.hideChordBass
        }
    },
    actions: {
        setFontSize(size) {
            this.fontSize = size
        },
        setShowChords(value) {
            this.showChords = value
        },
        setHideChordBass(value) {
            this.hideChordBass = value
        },
        setKeepScreenOn(value) {
            this.keepScreenOn = value
        },
        setSongsEtag(etag) {
            this.songsEtag = etag
        },
        setSongsVersion(version) {
            this.songsVersion = normalizeSongsVersion(version)
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
        },
        addRecentSong(number) {
            this.recentSongs = addRecent(this.recentSongs, number)
        },
        clearRecentSongs() {
            this.recentSongs = []
        }
    },
    persist: true // Для сохранения настроек между сессиями
})
