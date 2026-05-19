<template>
  <button class="favorite-btn" :class="{ active: isFav }" @click.stop="toggle">
    <span class="heart-icon">{{ isFav ? '♥' : '♡' }}</span>
  </button>
</template>

<script setup>
const props = defineProps({
  songNumber: {
    type: [Number, String],
    required: true
  }
})

const { isFavorite, toggleFavorite } = useFavoritesStore()

const isFav = computed(() => isFavorite(props.songNumber))

const toggle = () => {
  toggleFavorite(props.songNumber)
}
</script>

<style scoped>
.favorite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  color: var(--text-secondary);
  transition: color 0.2s, transform 0.15s;
  flex-shrink: 0;
}

.favorite-btn:hover {
  transform: scale(1.2);
}

.favorite-btn.active {
  color: #ef4444;
}

.heart-icon {
  font-size: 1.25rem;
  line-height: 1;
}
</style>
