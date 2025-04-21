export const useSongs = () => {
    const { addSongs } = useIndexDB()

    const fetchSongs = async (number) => {
        try {
            // Правильный путь к файлу
            const response = await fetch('/assets/songs.json')

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
            return true
        } catch (error) {
            console.error('Ошибка загрузки песен:', error)
            return false
        }
    }

    return { fetchSongs }
}