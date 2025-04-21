<template>
  <div class="welcome-screen">
    <h1>Сборник текстов песен</h1>
    <p>Выберите номер песни для просмотра текста</p>

    <form @submit.prevent="goToSong">
      <input
          ref="songInput"
          v-model.number="songNumber"
          type="number"
          min="1"
          max="2000"
          placeholder="Номер песни (1-2000)"
          required
          inputmode="numeric"
          pattern="[0-9]*"
          class="song-input"
      >
      <button type="submit">Перейти</button>
    </form>
  </div>
</template>

<script setup>
const songNumber = ref(null)
const songInput = ref(null)
const router = useRouter()

onMounted(() => {
  // Устанавливаем фокус при загрузке
  songInput.value.focus()

  // Для мобильных устройств дополнительно активируем числовую клавиатуру
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    songInput.value.removeAttribute('readonly') // На случай если readonly мешает
    songInput.value.click() // Дополнительный триггер для iOS
  }
})

const goToSong = () => {
  if (songNumber.value >= 1 && songNumber.value <= 2000) {
    router.push(`/song/${songNumber.value}`)
  }
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
</style>