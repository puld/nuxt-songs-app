<template>
  <div>
    <div v-if="loading">Загрузка...</div>
    <div v-else-if="song">
      <div class="navigation">
        <button
            v-if="hasPrev"
            @click="goToSong(prevSongNumber)"
            class="nav-button"
        >
          ← Предыдущая ({{ prevSongNumber }})
        </button>

        <button
            v-if="hasNext"
            @click="goToSong(nextSongNumber)"
            class="nav-button"
        >
          Следующая ({{ nextSongNumber }}) →
        </button>
      </div>

      <SongDisplay :song="song" />

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
const router = useRouter()
const {
  getSong,
  getSongNumbers,
  createCollection,
  getCollectionsForSong,
  addSongToCollection,
  getAvailableCollections,
  removeSongFromCollection
} = useIndexDB();

const song = ref(null);
const loading = ref(true);
const isShowChords = ref(false);
const collections = ref([]);
const songCollections = ref([]);
const selectedCollection = ref('');
const newCollectionName = ref('');
const songNumbers = ref([]);
const currentIndex = ref(-1);

onMounted(async () => {
  const songNumber = parseInt(route.params.number);

  songNumbers.value = await getSongNumbers()
  song.value = await getSong(songNumber);
  currentIndex.value = songNumbers.value.indexOf(songNumber)

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

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < songNumbers.value.length - 1)
const prevSongNumber = computed(() => hasPrev.value ? songNumbers.value[currentIndex.value - 1] : null)
const nextSongNumber = computed(() => hasNext.value ? songNumbers.value[currentIndex.value + 1] : null)

const goToSong = (number) => {
  router.push(`/song/${number}`)
}

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

const hasChords = computed((str) => {
  return isShowChords.value && /\{/.test(str);
});

const nl2br = computed((str) => {
  if (isShowChords.value) {
    str = str.replace(/\{_/g, "<span class='chord'>");
    str = str.replace(/\{/g, "<span class='chord chord-up'>");
    str = str.replace(/\}/g, "</span>");
  } else {
    str = str.replace(/\{[^\}]+\}/g, '');
  }
  str = str.replace(/([^>])\n/g, '$1<br/>');
  return str;
});
</script>

<style scoped>

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