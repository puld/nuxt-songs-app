<template>
  <div class="collection-card">
    <div class="collection-info">
      <h3>{{ collection.name }}</h3>
      <p>{{ songsCount }} {{ pluralize(songsCount, 'песня', 'песни', 'песен') }}</p>
    </div>

    <div class="collection-actions">
      <NuxtLink
          :to="`/collections/${collection.id}`"
          class="view-button"
      >
        Открыть
      </NuxtLink>
      <button
          class="delete-button"
          @click.stop="$emit('delete', collection)"
      >
        Удалить
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useIndexDB } from '~/composables/useIndexDB'
import { useUtils } from '~/composables/utils'

const props = defineProps({
  collection: {
    type: Object,
    required: true
  }
});

defineEmits(['delete']);

const { getSongsCountInCollection } = useIndexDB()
const { pluralize } = useUtils();

const songsCount = ref(0)

onMounted(async () => {
  songsCount.value = await getSongsCountInCollection(props.collection.id)
})
</script>

<style scoped>
.collection-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  transition: transform 0.2s;
}

.collection-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.collection-info h3 {
  margin: 0 0 0.5rem 0;
  color: var(--text);
}

.collection-info p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.collection-actions {
  display: flex;
  gap: 0.5rem;
}

.view-button {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  text-decoration: none;
  cursor: pointer;
}

.delete-button {
  padding: 0.5rem 1rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>