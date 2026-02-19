<template>
  <ClientOnly>
    <!-- Слот для контента в центре навбара -->
    <Teleport to="#navbar-center" v-if="song">
      <span class="nav-title">{{ song.number }}. {{ song.title }}</span>
    </Teleport>
  </ClientOnly>

  <div v-if="loading">Загрузка...</div>
  <div v-else-if="song">
    <div class="song-nav">
      <NuxtLink
          v-if="hasPrev"
          @click="goToSong(prevSongNumber)"
          class="nav-link prev"
      >
        <Icon name="mingcute:left-line" />
        {{ prevSongNumber }}
      </NuxtLink>

<!--      <span class="song-number">{{ song.number }}</span>-->

      <NuxtLink
          v-if="hasNext"
          @click="goToSong(nextSongNumber)"
          class="nav-link next"
      >
        {{ nextSongNumber }}
        <Icon name="mingcute:right-line" />
      </NuxtLink>
    </div>

    <SongDisplay :song="song"/>

    <div class="song-nav">
      <NuxtLink
          v-if="hasPrev"
          @click="goToSong(prevSongNumber)"
          class="nav-link prev"
      >
        <Icon name="mingcute:left-line" />
        {{ prevSongNumber }}
      </NuxtLink>

      <NuxtLink
          v-if="hasNext"
          @click="goToSong(nextSongNumber)"
          class="nav-link next"
      >
        {{ nextSongNumber }}
        <Icon name="mingcute:right-line" />
      </NuxtLink>
    </div>

    <div class="collections-section">
      <div v-if="songCollections.length > 0" class="current-collections">
        <h3>Входит в подборки:</h3>
        <ul>
          <li v-for="col in songCollections" :key="col.id" class="nav">

            <NuxtLink :to="`/collections/${col.id}`">{{ col.name }}</NuxtLink>
            <NuxtLink @click="removeFromCollection(col.id)" class="remove-btn">Х</NuxtLink>
          </li>
        </ul>
      </div>
      <h3>Добавить в подборку</h3>
      <nav class="nav">
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

        <NuxtLink @click="addToCollection">
          <Icon name="mingcute:add-line" />
        </NuxtLink>
      </nav>
    </div>
  </div>
  <div v-else>
    <p>Песня не найдена</p>
    <NuxtLink to="/">Вернуться на главную</NuxtLink>
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
.song-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  margin: 1rem 0;
}

.song-number {
  font-weight: bold;
  color: var(--text);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-link:hover {
  background: var(--bg-secondary);
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