import { ref } from 'vue'
import { useIndexDB } from './useIndexDB'
import { buildSongsMap, songNumbersFrom, buildChordsIndex } from '~/lib/songsIndex'

// Кэш песен на уровне модуля: `getAllSongs()` тянет из IndexedDB 1565 записей
// с полным текстом, а страница песни вызывала его при каждом переходе. Грузим
// один раз за сессию; инвалидация — после обновления базы.
const allSongs = ref([])
const songNumbers = ref([])
const songsMap = ref(new Map())
// Номера песен с размеченными аккордами: признак считается по тексту здесь же,
// пока песни в руках, — иначе список и выдача поиска перебирали бы их сами
const songsWithChords = ref(new Set())

// Промис первой загрузки: если два компонента запросят песни одновременно,
// транзакция к БД будет одна.
let loadPromise = null

/**
 * Сбрасывает кэш песен. Вызывается после обновления базы
 * (`useSongs.fetchSongs`), чтобы следующий запрос перечитал IndexedDB.
 */
export const invalidateSongsCache = () => {
    loadPromise = null
    allSongs.value = []
    songNumbers.value = []
    songsMap.value = new Map()
    songsWithChords.value = new Set()
}

export const useSongsCache = () => {
    const { getAllSongs } = useIndexDB()

    /**
     * Возвращает песни из кэша, при первом обращении читает IndexedDB.
     * Номера выводятся из загруженных песен: `getAllSongs()` отдаёт записи
     * в порядке ключа `number`, поэтому вторая транзакция не нужна.
     *
     * @returns {Promise<{songs: Array, numbers: number[], map: Map}>}
     */
    const loadSongs = async () => {
        if (!loadPromise) {
            loadPromise = (async () => {
                const songs = await getAllSongs()

                allSongs.value = songs
                songNumbers.value = songNumbersFrom(songs)
                songsMap.value = buildSongsMap(songs)
                songsWithChords.value = buildChordsIndex(songs)

                return {
                    songs: allSongs.value,
                    numbers: songNumbers.value,
                    map: songsMap.value,
                    withChords: songsWithChords.value
                }
            })().catch((error) => {
                // Ошибку не кэшируем — иначе неудачная загрузка залипнет
                // на всю сессию и песни больше не появятся.
                loadPromise = null
                throw error
            })
        }

        return loadPromise
    }

    return {
        allSongs,
        songNumbers,
        songsMap,
        songsWithChords,
        loadSongs,
        invalidateSongsCache
    }
}
