<template>
  <div class="welcome-screen">
    <h1>Сборник текстов песен</h1>
    <p>Выберите номер песни для просмотра текста</p>

    <form @submit.prevent="goToSong">
      <input
          v-model.number="songNumber"
          type="number"
          min="1"
          max="2000"
          placeholder="Номер песни (1-2000)"
          required
      >
      <button type="submit">Перейти</button>
    </form>
  </div>
</template>

<script setup>
const songNumber = ref(null);
const router = useRouter();

const goToSong = () => {
  if (songNumber.value >= 1 && songNumber.value <= 2000) {
    router.push(`/song/${songNumber.value}`);
  }
};
</script>

<style scoped>
.welcome-screen {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

input {
  padding: 0.5rem;
  margin-right: 0.5rem;
  width: 200px;
}

button {
  padding: 0.5rem 1rem;
}
</style>