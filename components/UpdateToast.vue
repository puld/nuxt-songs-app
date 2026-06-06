<template>
  <Transition name="toast-slide">
    <div v-if="visible" class="update-toast">
      <span class="toast-text">Доступно обновление базы данных</span>
      <button class="toast-btn" :disabled="updating" @click="handleUpdate">
        {{ updating ? 'Обновление...' : 'Обновить' }}
      </button>
      <button class="toast-close" @click="dismiss" aria-label="Закрыть">
        <Icon name="mingcute:close-line" size="1rem"/>
      </button>
    </div>
  </Transition>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'applied'])

const autoUpdate = useAutoUpdate()
const visible = ref(false)
const updating = ref(false)
let autoHideTimer = null

watch(() => props.modelValue, (val) => {
  if (val) {
    visible.value = true
    scheduleAutoHide()
  } else {
    visible.value = false
    clearAutoHide()
  }
})

const dismiss = () => {
  visible.value = false
  emit('update:modelValue', false)
  clearAutoHide()
}

const handleUpdate = async () => {
  updating.value = true
  const success = await autoUpdate.applyUpdate()
  updating.value = false

  if (success) {
    visible.value = false
    emit('update:modelValue', false)
    emit('applied')
    clearAutoHide()
  }
}

const scheduleAutoHide = () => {
  clearAutoHide()
  autoHideTimer = setTimeout(() => {
    dismiss()
  }, 30000)
}

const clearAutoHide = () => {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

onUnmounted(() => {
  clearAutoHide()
})
</script>

<style scoped>
.update-toast {
  position: fixed;
  bottom: 5rem;
  left: 1rem;
  right: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--primary);
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  z-index: 400;
}

.toast-text {
  font-size: 0.9rem;
  color: var(--text);
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.toast-btn {
  padding: 0.4rem 0.9rem;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;
}

.toast-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toast-btn:not(:disabled):active {
  opacity: 0.8;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.toast-close:hover {
  background: var(--bg-secondary);
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
