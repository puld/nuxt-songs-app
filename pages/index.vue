<template>
  <div class="welcome-screen">
    <h1>Сборник текстов песен</h1>


    <div v-if="!songNumbers.length">
      <p>Необходимо перейти в настройки и принудительно обновить базу данных текстов песен.</p>
      <NuxtLink to="/settings">Перейти в настройки для обновления</NuxtLink>
    </div>
    <div v-else>
      <p>Выберите номер песни (доступно {{ songNumbers.length }} песен)</p>
      <form @submit.prevent="goToSong">
        <input
            ref="songInput"
            v-model.number="songNumber"
            type="number"
            :min="1"
            :max="Math.max(...songNumbers)"
            :placeholder="`Номер песни (${Math.min(...songNumbers)}-${Math.max(...songNumbers)})`"
            required
            inputmode="numeric"
            pattern="[0-9]*"
            class="song-input"
        >
        <button type="submit">Перейти</button>
      </form>
    </div>
  </div>
</template>

<script setup>
const {getSongNumbers} = useIndexDB()

const songNumber = ref(null)
const songInput = ref(null)
const songsCount = ref(0)
const songNumbers = ref([]);
const router = useRouter()

onMounted(async () => {

  songNumbers.value = await getSongNumbers()
  // Устанавливаем фокус
  songInput.value.focus()

  // Активация числовой клавиатуры для мобильных
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    songInput.value.click()
  }
})


const goToSong = () => {
  const num = Number(songNumber.value)
  if (!songNumbers.value.includes(num)) {
    alert(`Песни с номером ${num} не существует. Доступные номера: ${songNumbers.value.join(', ')}`)
    return
  }
  router.push(`/song/${num}`)
}
</script>

<style scoped>
.welcome-screen {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
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