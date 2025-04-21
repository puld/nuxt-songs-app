<template>
  <div>
    <div v-if="loading">Загрузка...</div>
    <div v-else-if="song">
      <h2>Песня №{{ song.number }}</h2>
      <pre class="song-text">{{ song.text }}</pre>
      <pre class="song-text">{{ song.tags }}</pre>

      <div class="collections-section">
        <h3>Добавить в подборку</h3>
        <select v-model="selectedCollection">
          <option value="">Новая подборка</option>
          <option
              v-for="collection in collections"
              :key="collection.id"
              :value="collection.id"
          >
            {{ collection.name }}
          </option>
        </select>

        <input
            v-if="selectedCollection === ''"
            v-model="newCollectionName"
            placeholder="Название подборки"
        >

        <button @click="addToCollection">Добавить</button>

        <div v-if="songCollections.length > 0" class="current-collections">
          <h3>Входит в подборки:</h3>
          <ul>
            <li v-for="col in songCollections" :key="col.id">
              <NuxtLink :to="`/collections/${col.id}`">{{ col.name }}</NuxtLink>
              <button
                  @click="removeFromCollection(col.id)"
                  class="remove-btn"
              >
                Удалить
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div v-else>
      <p>Песня не найдена</p>
      <NuxtLink to="/">Вернуться на главную</NuxtLink>
    </div>
  </div>
</template>

<script setup>
const route = useRoute();
const { getSong, createCollection, getCollectionsForSong, addSongToCollection, getAvailableCollections, removeSongFromCollection } = useIndexDB();

const song = ref(null);
const loading = ref(true);
const collections = ref([]);
const songCollections = ref([]);
const selectedCollection = ref('');
const newCollectionName = ref('');

onMounted(async () => {
  const songNumber = parseInt(route.params.number);
  song.value = await getSong(songNumber);

  if (!song.value) {
    loading.value = false;
    return;
  }

  // Загружаем коллекции, в которые входит песня
  songCollections.value = await getCollectionsForSong(songNumber);

  // Загружаем все доступные коллекции
  collections.value = await getAvailableCollections(songNumber);

  loading.value = false;
});

const addToCollection = async () => {
  if (selectedCollection.value === '') {
    if (!newCollectionName.value.trim()) return;

    // Создаем новую коллекцию
    selectedCollection.value = await createCollection(newCollectionName.value);
  }

  // Добавляем песню в коллекцию
  await addSongToCollection(selectedCollection.value, song.value.number);

  // Обновляем список коллекций песни
  songCollections.value = await getCollectionsForSong(song.value.number);

  // Сбрасываем выбор
  selectedCollection.value = '';
  newCollectionName.value = '';
};

const removeFromCollection = async (collectionId) => {
  if (!confirm('Удалить песню из этой подборки?')) return

  try {
    await removeSongFromCollection(
        Number(collectionId),
        Number(route.params.number)
    )
    // Обновляем списки
    songCollections.value = songCollections.value.filter(
        c => c.id !== collectionId
    )
    collections.value = await getAvailableCollections(route.params.number)
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить песню')
  }
}
</script>

<style scoped>
.song-text {
  white-space: pre-wrap;
  font-family: inherit;
  background: var(--bg-secondary);
  padding: 1rem;
  border-radius: 4px;
}

.collections-section {
  margin-top: 2rem;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.current-collections ul {
  list-style: none;
  padding: 0;
}

.current-collections li {
  margin: 0.5rem 0;
}

.remove-btn {
  padding: 0.25rem 0.5rem;
  margin-left: 1rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>