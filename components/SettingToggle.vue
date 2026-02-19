<template>
  <div class="setting-toggle">
    <div class="buttons-container">
      <button
          v-for="option in options"
          :key="option.value"
          @click="handleClick(option.value)"
          :class="{ active: activeValue === option.value }"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  options: {
    type: Array,
    required: true
  },
  activeValue: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['update:value'])

const handleClick = (value) => {
  emit('update:value', value)
}
</script>

<style scoped>
.setting-toggle {
  margin-top: 10px;
}

.buttons-container {
  display: flex;
  gap: 10px;
}

.buttons-container button {
  padding: 8px 15px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.buttons-container button:hover {
  background: var(--bg-primary-hover);
}

.buttons-container button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
</style>