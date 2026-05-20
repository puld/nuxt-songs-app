<template>
  <ClientOnly>
    <Teleport to="#navbar-center">
      <span v-if="collection" class="nav-title">{{ collection.name }}</span>
    </Teleport>
  </ClientOnly>

  <div>
    <div v-if="loading">Загрузка...</div>
    <div v-else-if="!collection">
      <p>Подборка не найдена</p>
      <NuxtLink to="/collections">Назад к списку</NuxtLink>
    </div>
    <div v-else>
      <h2>Подборка: {{ collection.name }}</h2>
      <p>Количество песен: {{ songs.length }}</p>

      <div v-if="songs.length === 0" class="empty">
        <p>В этой подборке пока нет песен</p>
        <NuxtLink to="/">Добавить песни</NuxtLink>
      </div>

      <div v-else class="songs-list">
        <div v-for="song in songs" :key="song.number + '-' + song.variantIndex" class="song-item">
          {{ song.number }}. <NuxtLink :to="songLink(song)">{{ song.title }}</NuxtLink>
          <span v-if="getVariantLabel(song) && song.variantIndex > 0" class="variant-badge">{{ getVariantLabel(song) }}</span>
          <button @click="removeSong(song)" class="remove-btn">
            Удалить из подборки
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const route = useRoute()
const { getSongsInCollection, getCollection, removeSongFromCollection } = useIndexDB()

const collection = ref(null)
const songs = ref([])
const loading = ref(true)

const songLink = (song) => {
  const path = `/song/${song.number}`
  return song.variantIndex > 0 ? `${path}?v=${song.variantIndex}` : path
}

const getVariantLabel = (song) => {
  if (!song.variants) return ''
  const label = song.variants[song.variantIndex]?.label
  return label || ''
}

const removeSong = async (song) => {
  const variantLabel = getVariantLabel(song)
  const variantInfo = variantLabel && song.variantIndex > 0 ? ` (вариант ${variantLabel})` : ''
  if (!confirm(`Удалить песню${variantInfo} из подборки?`)) return

  try {
    await removeSongFromCollection(
      Number(route.params.id),
      Number(song.number),
      song.variantIndex ?? 0
    )
    // Обновляем список песен
    songs.value = songs.value.filter(s => !(s.number === song.number && s.variantIndex === song.variantIndex))
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить песню')
  }
}

onMounted(async () => {
  try {
    const collectionId = Number(route.params.id)

    // Загружаем данные подборки
    collection.value = await getCollection(collectionId)

    // Загружаем песни подборки (с variantIndex)
    songs.value = await getSongsInCollection(collectionId)
  } catch (error) {
    console.error('Ошибка загрузки:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.songs-list {
  margin-top: 2rem;
  display: grid;
  gap: 1rem;
}

.song-item {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  transition: transform 0.2s;
}

.song-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.empty {
  margin-top: 2rem;
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.variant-badge {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-secondary);
}

.remove-btn {
  padding: 0.25rem 0.5rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  float: right;
}

.remove-btn:hover {
  opacity: 0.9;
}
</style>
