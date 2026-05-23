import { useIndexDB } from './useIndexDB'

/**
 * Composable для загрузки песен из JSON файла.
 * Единая точка входа для загрузки песен — используется плагином и настройками.
 * После успешной загрузки сохраняет ETag ответа в settings store.
 */
export const useSongs = () => {
    const { addSongs } = useIndexDB()

    /**
     * Загружает песни из файла assets/songs.json и сохраняет в IndexedDB.
     * Сохраняет ETag ответа в settings store для автообновления.
     *
     * @returns {Promise<boolean>} true при успешной загрузке, false при ошибке
     */
    const fetchSongs = async () => {
        try {
            const response = await fetch('assets/songs.json')

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            // Проверяем, что ответ действительно JSON
            const contentType = response.headers.get('content-type')
            if (!contentType || !contentType.includes('application/json')) {
                throw new TypeError("Получен не JSON-ответ")
            }

            const data = await response.json()
            await addSongs(data.songs)

            // Сохраняем ETag для автообновления
            const etag = response.headers.get('etag')
            if (etag) {
                const settings = useSettingsStore()
                settings.setSongsEtag(etag)
            }

            return true
        } catch (error) {
            console.error('Ошибка загрузки песен:', error)
            return false
        }
    }

    return { fetchSongs }
}
