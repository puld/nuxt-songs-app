import { useStorage } from '@vueuse/core'
import { DEFAULT_SONGS_LIST_MODE, normalizeSongsListMode } from '~/lib/songsList'
import { addRecent, normalizeRecent } from '~/lib/recentSongs'
import { normalizeSongsVersion, DEFAULT_SONGS_VERSION } from '~/lib/songsVersion'

/**
 * Одноразовая миграция: «Без басов» до объединения тогглов жил отдельным
 * ключом `hideChordBass` (см. CLAUDE.md, «Аккорды упрощаются для гитары по
 * настройке»). Значение переносится в `simplifyChords`, только если новый
 * ключ ещё не создан — иначе у тех, кто уже включал старый тоггл, аккорды
 * после обновления перестали бы упрощаться молча.
 */
function migrateHideChordBass() {
    if (typeof localStorage === 'undefined') return
    try {
        if (localStorage.getItem('simplifyChords') !== null) return
        if (localStorage.getItem('hideChordBass') === 'true') {
            localStorage.setItem('simplifyChords', 'true')
        }
    } catch {
        // localStorage недоступен (приватный режим, отключённые cookies) —
        // тогда и useStorage ничего не сохранит, специальной обработки не нужно
    }
}

export const useSettingsStore = defineStore('settings', {
    state: () => {
        migrateHideChordBass()
        return {
            fontSize: useStorage('fontSize', 'medium'), // 'small', 'medium', 'large'
            showChords: useStorage('showChords', false),
            // Упрощает аккорды для гитары: снимает бас (`G/B` → `G`) и
            // сворачивает sus4/sus2/dim/dim7/m7b5/+ до мажора, минора или
            // доминантсептаккорда. Аккорды сняты с партитуры для фортепиано,
            // а не под гитару, и такие обозначения там избыточны
            simplifyChords: useStorage('simplifyChords', false),
            // Писать аккорды диезами всегда, а не по конвенции целевой тональности
            // (`preferSharp`): на гитаре диезы читать привычнее бемолей
            forceSharp: useStorage('forceSharp', false),
            // Немецкая (H) нотация: «си» — H, «си-бемоль» — B без знака. Не вариант
            // диезов/бемолей, а замена буквы для двух конкретных ступеней —
            // конвенция сольфеджио в СНГ, отличная от английской (B = си)
            germanNotation: useStorage('germanNotation', false),
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
        }
    },
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
        chordsSimplified() {
            return this.chordsVisible && this.simplifyChords
        },
        sharpForced() {
            return this.chordsVisible && this.forceSharp
        },
        germanNotationOn() {
            return this.chordsVisible && this.germanNotation
        }
    },
    actions: {
        setFontSize(size) {
            this.fontSize = size
        },
        setShowChords(value) {
            this.showChords = value
        },
        setSimplifyChords(value) {
            this.simplifyChords = value
        },
        setForceSharp(value) {
            this.forceSharp = value
        },
        setGermanNotation(value) {
            this.germanNotation = value
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

