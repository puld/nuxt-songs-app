import { useStorage } from '@vueuse/core'

export const useFavoritesStore = defineStore('favorites', () => {
    const favoriteSongs = useStorage('favoriteSongs', [])

    const isFavorite = (songNumber) => {
        return favoriteSongs.value.includes(Number(songNumber))
    }

    const toggleFavorite = (songNumber) => {
        const num = Number(songNumber)
        const index = favoriteSongs.value.indexOf(num)
        if (index === -1) {
            favoriteSongs.value.push(num)
        } else {
            favoriteSongs.value.splice(index, 1)
        }
    }

    return {
        favoriteSongs,
        isFavorite,
        toggleFavorite
    }
})
