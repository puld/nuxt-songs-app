<template>
  <div class="song-card" @click="$emit('click', song)">
    <div class="song-number">№{{ song.n }}</div>
    <div class="song-preview">
      {{ song.title }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  song: {
    type: Object,
    required: true
  }
});

defineEmits(['click']);
</script>

<style scoped>
.song-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  background: var(--bg-secondary);
  transition: transform 0.2s;
}

.song-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.song-number {
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--primary);
}

.song-preview {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>