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
    <div v-else class="collections-grid">
      <NuxtLink to="/collections/favorites" class="favorites-card">
        <div class="card-content">
          <span class="card-icon">♥</span>
          <span class="card-name">Избранное</span>
          <span class="card-count">{{ pluralize(favoritesCount, ['песня', 'песни', 'песен']) }}</span>
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
.collections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.favorites-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  background: var(--bg-secondary);
  transition: transform 0.2s;
  text-decoration: none;
  color: var(--text);
}

.favorites-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.favorites-card .card-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.favorites-card .card-icon {
  font-size: 2rem;
  color: #ef4444;
  line-height: 1;
}

.favorites-card .card-name {
  font-weight: bold;
  font-size: 1.1rem;
}

.favorites-card .card-count {
  color: var(--text-secondary);
  font-size: 0.9rem;
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