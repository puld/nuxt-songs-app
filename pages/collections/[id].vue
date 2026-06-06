<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span v-if="collection" class="nav-title">{{ collection.name }}</span>
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport v-if="collection && songs.length > 0" to="#navbar-right">
      <button class="nav-btn" @click="editMode = !editMode" :aria-label="editMode ? 'Готово' : 'Редактировать'">
        <span v-if="editMode" class="edit-done">Готово</span>
        <Icon v-else name="mingcute:edit-2-line" size="1.5rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <div class="collection-page">
    <div v-if="loading">
      <LoadingText />
    </div>
    <div v-else-if="!collection">
      <p>Подборка не найдена</p>
      <NuxtLink to="/">На главную</NuxtLink>
    </div>
    <div v-else>
      <div v-if="songs.length === 0" class="empty">
        <p>В этой подборке пока нет песен</p>
        <NuxtLink to="/">Добавить песни</NuxtLink>
      </div>

      <div v-else class="songs-list">
        <div
          v-for="song in songs"
          :key="song.number + '-' + song.variantIndex"
          class="song-item"
          :class="{ 'edit-mode': editMode }"
        >
          <NuxtLink
            v-if="!editMode"
            :to="songLink(song)"
            class="song-link"
          >
            <span class="song-number">{{ song.number }}</span>
            <span class="song-title">{{ song.title }}</span>
            <span v-if="getVariantLabel(song) && song.variantIndex > 0" class="variant-label">({{ getVariantLabel(song) }})</span>
          </NuxtLink>
          <div v-else class="song-link">
            <span class="song-number">{{ song.number }}</span>
            <span class="song-title">{{ song.title }}</span>
            <span v-if="getVariantLabel(song) && song.variantIndex > 0" class="variant-label">({{ getVariantLabel(song) }})</span>
          </div>
          <button v-if="editMode" @click="removeSong(song)" class="remove-btn" aria-label="Удалить">
            <Icon name="mingcute:delete-2-line" size="1.25rem"/>
          </button>
        </div>
      </div>

      <div v-if="editMode && !collection.isFavorite" class="delete-collection-section">
        <button @click="deleteCollection" class="delete-collection-btn">
          <Icon name="mingcute:delete-2-line" size="1.1rem"/>
          <span>Удалить подборку</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const route = useRoute()
const router = useRouter()
const { getSongsInCollection, getCollection, removeSongFromCollection, deleteCollection: deleteCollectionDB } = useIndexDB()

const collection = ref(null)
const songs = ref([])
const loading = ref(true)
const editMode = ref(false)

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
    songs.value = songs.value.filter(s => !(s.number === song.number && s.variantIndex === song.variantIndex))
    if (songs.value.length === 0) editMode.value = false
  } catch (error) {
    console.error('Ошибка удаления:', error)
  }
}

const deleteCollection = async () => {
  if (!confirm(`Удалить подборку «${collection.value.name}»?`)) return

  try {
    await deleteCollectionDB(Number(route.params.id))
    router.push('/')
  } catch (error) {
    console.error('Ошибка удаления подборки:', error)
  }
}

onMounted(async () => {
  try {
    const collectionId = Number(route.params.id)
    collection.value = await getCollection(collectionId)
    songs.value = await getSongsInCollection(collectionId)
  } catch (error) {
    console.error('Ошибка загрузки:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.collection-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem;
}

.songs-list {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.song-item {
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
}

.song-item:last-child {
  border-bottom: none;
}

.song-item.edit-mode {
  background: var(--bg-secondary);
}

.song-link {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0.85rem 0.8rem;
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}

a.song-link:hover {
  background-color: var(--bg-secondary);
}

.song-number {
  font-weight: bold;
  min-width: 2.5rem;
  text-align: right;
  margin-right: 0.5rem;
  color: var(--primary);
  flex-shrink: 0;
}

.song-title {
  flex-grow: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-label {
  font-size: 0.75rem;
  color: var(--primary);
  margin-left: 0.3rem;
  flex-shrink: 0;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: none;
  color: var(--danger);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 4px;
  margin-right: 0.25rem;
}

.remove-btn:hover {
  background: var(--danger);
  color: white;
}

.edit-done {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--primary);
}

.empty {
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.delete-collection-section {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.delete-collection-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  background: none;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.delete-collection-btn:hover {
  background: var(--danger);
  color: white;
}
</style>
