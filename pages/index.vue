<template>
  <div class="welcome-screen">
    <h1>Сборник текстов песен</h1>
    <div v-if="!allSongs.length">
      <p>Необходимо перейти в настройки и принудительно обновить базу данных текстов песен.</p>
      <NuxtLink to="/settings">Перейти в настройки для обновления</NuxtLink>
    </div>
    <div v-else>

      <div class="search-container">
        <input
            v-model="searchQuery"
            @input="handleSearch"
            placeholder="Поиск по тексту песен..."
            class="search-input"
        >

        <div v-if="searchResults.length" class="search-results">
          <div
              v-for="result in searchResults"
              :key="result.n"
              class="result-item"
              @click="goToSong(result.n)"
          >
            <span class="song-number">{{ result.n }}.</span>
            <span class="song-title">{{ getSongTitle(result.n) }}</span>
            <span class="score">(совпадение: {{ (result.score * 100).toFixed(1) }}%)</span>
          </div>
        </div>
      </div>

      <div class="song-selector">
        <p>Или выберите номер песни (доступно {{ songsCount }} песен)</p>

        <form @submit.prevent="goToSelectedSong">
          <input
              ref="songInput"
              v-model.number="songNumber"
              type="number"
              :min="1"
              :max="maxSongNumber"
              :placeholder="`Номер (1-${maxSongNumber})`"
              required
              inputmode="numeric"
              class="song-input"
          >
          <button type="submit">Перейти</button>
        </form>
      </div>


      <!--      <p>Выберите номер песни (доступно {{ songNumbers.length }} песен)</p>-->
      <!--      <form @submit.prevent="goToSong">-->
      <!--        <input-->
      <!--            ref="songInput"-->
      <!--            v-model.number="songNumber"-->
      <!--            type="number"-->
      <!--            :min="1"-->
      <!--            :max="Math.max(...songNumbers)"-->
      <!--            :placeholder="`Номер песни (${Math.min(...songNumbers)}-${Math.max(...songNumbers)})`"-->
      <!--            required-->
      <!--            inputmode="numeric"-->
      <!--            pattern="[0-9]*"-->
      <!--            class="song-input"-->
      <!--        >-->
      <!--        <button type="submit">Перейти</button>-->
      <!--      </form>-->
    </div>
  </div>
</template>

<script setup>
// import { ref, onMounted } from 'vue'
// import { useSongSearch } from '~/composables/useSongSearch'
// import { useIndexDB } from '~/composables/useIndexDB'

const {getSongsCount, getAllSongs, getSongNumbers} = useIndexDB()
const {searchIndex, searchResults, searchQuery, buildIndex, search} = useSongSearch()

const allSongs = ref([])
const songNumber = ref(null)
const songInput = ref(null)
const songsCount = ref(0)
const maxSongNumber = ref(0)
const songNumbers = ref([]);
const router = useRouter()

onMounted(async () => {
  songsCount.value = await getSongsCount()
  allSongs.value = await getAllSongs()
  songNumbers.value = await getSongNumbers()
  maxSongNumber.value = Math.max(...songNumbers.value)
  // Устанавливаем фокус
  if (songNumbers.length) {
    songInput.value.focus()
  }
  // Строим поисковый индекс
  buildIndex(allSongs.value)

  // Активация числовой клавиатуры для мобильных
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    songInput.value.click()
  }
})

const handleSearch = () => {
  search(searchQuery.value)
}

const getSongTitle = (n) => {
  const song = allSongs.value.find(s => s.number === n)
  return song ? song.title : 'Неизвестная песня'
}

const goToSong = (n) => {
  if (n) {
    navigateTo(`/song/${n}`)
  }
}

const goToSelectedSong = () => {
  if (songNumber.value >= 1 && songNumber.value <= maxSongNumber.value) {
    goToSong(songNumber.value)
  }
}

</script>

<style scoped>
.welcome-screen {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.search-container {
  margin-bottom: 2rem;
}

.search-input {
  width: 100%;
  padding: 0.8rem;
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 1rem;
}

.search-results {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  padding: 0.8rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.result-item:hover {
  background-color: var(--bg-secondary);
}

.song-number {
  font-weight: bold;
  margin-right: 0.5rem;
  color: var(--primary);
}

.song-title {
  flex-grow: 1;
}

.score {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.song-selector {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color);
}


.song-input {
  padding: 0.5rem;
  margin-right: 0.5rem;
  width: 200px;
  font-size: 1rem;
  /* Улучшаем отображение на мобильных */
  -webkit-appearance: none;
  -moz-appearance: textfield;
}

/* Убираем стрелки у числового поля */
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

button {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

@media (max-width: 480px) {
  form {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .song-input {
    width: 80%;
    margin-right: 0;
    margin-bottom: 1rem;
    padding: 0.8rem;
    font-size: 1.2rem;
  }

  button {
    width: 80%;
    padding: 0.8rem;
  }
}

.song-input {
  /* Улучшаем отображение числового поля */
  -moz-appearance: textfield;
}

.song-input::-webkit-outer-spin-button,
.song-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

@media (max-width: 480px) {
  .song-input {
    font-size: 16px; /* Фикс для iOS чтобы не увеличивался шрифт */
  }
}
</style>