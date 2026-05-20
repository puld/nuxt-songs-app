<template>
  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Подборки</span>
    </Teleport>
  </ClientOnly>

  <div>
    <h1>Мои подборки</h1>

    <button @click="showCreateModal = true">Создать новую подборку</button>

    <div v-if="loading">Загрузка...</div>
    <div v-else class="collections-list">
      <NuxtLink to="/collections/favorites" class="favorites-row">
        <div class="favorites-info">
          <span class="favorites-icon">♥</span>
          <div class="favorites-text">
            <span class="favorites-name">Избранное</span>
            <span class="favorites-meta">{{ favoritesCount }} {{ pluralize(favoritesCount, 'песня', 'песни', 'песен') }}</span>
          </div>
        </div>
      </NuxtLink>

      <TransitionGroup name="fade">
        <CollectionCard
            v-for="collection in collections"
            :key="collection.id"
            :collection="collection"
            @delete="deleteCollectionAction"
        />
      </TransitionGroup>
    </div>

    <div v-if="showCreateModal" class="modal">
      <div class="modal-content">
        <h3>Новая подборка</h3>
        <input v-model="newCollectionName" placeholder="Название подборки">
        <div class="modal-actions">
          <button @click="createNewCollection">Создать</button>
          <button @click="showCreateModal = false">Отмена</button>
        </div>
      </div>
    </div>

    <div v-if="showDeleteModal" class="modal">
      <div class="modal-content">
        <h3>Удалить подборку "{{ collectionToDelete?.name }}"?</h3>
        <p>Все песни в этой подборке будут удалены из нее.</p>
        <div class="modal-actions">
          <button @click="deleteCollectionAction">Удалить</button>
          <button @click="showDeleteModal = false">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const { getCollections, createCollection, deleteCollection } = useIndexDB();
const { favoriteSongs } = storeToRefs(useFavoritesStore())
const { pluralize } = useUtils()

const collections = ref([]);
const loading = ref(true);
const showCreateModal = ref(false);
const showDeleteModal = ref(false);
const newCollectionName = ref('');
const collectionToDelete = ref(null);

const favoritesCount = computed(() => favoriteSongs.value.length)

onMounted(async () => {
  collections.value = await getCollections();
  loading.value = false;
});

const confirmDelete = (collection) => {
  collectionToDelete.value = collection;
  showDeleteModal.value = true;
};

const createNewCollection = async () => {
  if (!newCollectionName.value.trim()) {
    alert('Введите название подборки')
    return
  }
  await createCollection(newCollectionName.value.trim())
  newCollectionName.value = '';
  showCreateModal.value = false;
  collections.value = await getCollections()
};

const deleteCollectionAction = async (collection) => {
  if (!confirm(`Вы уверены, что хотите удалить подборку "${collection.name}"?`)) return

  try {
    // Удаляем из IndexedDB
    await deleteCollection(collection.id)

    // Удаляем из локального состояния (без повторного запроса к IndexedDB)
    collections.value = collections.value.filter(c => c.id !== collection.id)
  } catch (error) {
    console.error('Ошибка удаления:', error)
    alert('Не удалось удалить подборку')
  }
}
</script>

<style scoped>
.collections-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.favorites-row {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.6rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  transition: background 0.15s;
  text-decoration: none;
  color: var(--text);
}

.favorites-row:hover {
  background: var(--border-color);
}

.favorites-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.favorites-icon {
  font-size: 1.5rem;
  color: #ef4444;
  line-height: 1;
}

.favorites-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.favorites-name {
  font-weight: 600;
}

.favorites-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg);
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 100%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1rem;
}

.fade-move, .fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
.fade-leave-active {
  position: absolute;
}
</style>