<template>
  <div class="collection-row">
    <div class="collection-info">
      <div v-if="editing" class="edit-name">
        <input
          ref="editInput"
          v-model="editName"
          class="edit-input"
          @keyup.enter="saveName"
          @keyup.escape="cancelEdit"
        >
      </div>
      <div v-else class="collection-name" :title="collection.name">
        {{ collection.name }}
      </div>
      <div class="collection-meta">
        {{ songsCount }} {{ pluralize(songsCount, 'песня', 'песни', 'песен') }}
      </div>
    </div>

    <div class="collection-actions">
      <NuxtLink
          :to="`/collections/${collection.id}`"
          class="view-button"
      >
        Открыть
      </NuxtLink>
      <button
          class="edit-button"
          @click.stop="startEdit"
      >
        ✎
      </button>
      <button
          class="delete-button"
          @click.stop="$emit('delete', collection)"
      >
        Удалить
      </button>
      <button
          v-if="editing"
          class="save-btn"
          @click.stop="saveName"
      >
        Сохранить
      </button>
      <button
          v-if="editing"
          class="cancel-btn"
          @click.stop="cancelEdit"
      >
        Отмена
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useIndexDB } from '~/composables/useIndexDB'
import { useUtils } from '~/composables/utils'

const props = defineProps({
  collection: {
    type: Object,
    required: true
  }
});

defineEmits(['delete']);

const { getSongsCountInCollection, updateCollection } = useIndexDB()
const { pluralize } = useUtils();

const songsCount = ref(0)
const editing = ref(false)
const editName = ref('')
const editInput = ref(null)

onMounted(async () => {
  songsCount.value = await getSongsCountInCollection(props.collection.id)
})

const startEdit = () => {
  editName.value = props.collection.name
  editing.value = true
  nextTick(() => editInput.value?.focus())
}

const cancelEdit = () => {
  editing.value = false
  editName.value = ''
}

const saveName = async () => {
  const name = editName.value.trim()
  if (!name) return
  try {
    await updateCollection(props.collection.id, name)
    props.collection.name = name
    editing.value = false
  } catch (error) {
    console.error('Ошибка обновления:', error)
    alert('Не удалось обновить название')
  }
}
</script>

<style scoped>
.collection-row {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.6rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  transition: background 0.15s;
}

.collection-row:hover {
  background: var(--border-color);
}

.collection-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.collection-name {
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collection-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.collection-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-shrink: 0;
  margin-left: 1rem;
}

.view-button {
  padding: 0.35rem 0.75rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.85rem;
}

.delete-button {
  padding: 0.35rem 0.75rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.edit-button {
  padding: 0.35rem 0.75rem;
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.edit-button:hover {
  background: var(--border-color);
}

.edit-input {
  padding: 0.2rem 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  border: 1px solid var(--primary);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
  min-width: 150px;
}

.edit-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.save-btn,
.cancel-btn {
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  border: none;
}

.save-btn {
  background: var(--primary);
  color: white;
}

.cancel-btn {
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border-color);
}
</style>