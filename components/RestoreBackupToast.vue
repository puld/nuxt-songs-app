<template>
  <Transition name="toast-slide">
    <div v-if="visible" class="restore-toast" data-testid="restore-backup-toast">
      <div class="toast-body">
        <span class="toast-text">
          Подборки не найдены, но есть резервная копия{{ savedAtText }}: {{ countsText }}.
        </span>
        <span v-if="error" class="toast-error">{{ error }}</span>
      </div>
      <button class="toast-btn" :disabled="restoring" data-testid="restore-backup-apply" @click="handleRestore">
        {{ restoring ? 'Восстановление...' : 'Восстановить' }}
      </button>
      <button class="toast-close" data-testid="restore-backup-dismiss" aria-label="Закрыть" @click="handleDismiss">
        <Icon name="mingcute:close-line" size="1rem"/>
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { backupStats } from '~/lib/collectionsBackup'

/**
 * Предложение восстановить подборки из автокопии.
 *
 * Показывается только когда база подборок пуста, а копия содержательна —
 * то есть после реальной потери данных (освобождение IndexedDB, переустановка).
 * Условие проверяет `useCollectionsBackup.checkRestorable()`.
 */
const { restorableBackup, checkRestorable, restoreFromAutoBackup, dismissRestore } = useCollectionsBackup()
const { pluralize } = useUtils()

const visible = ref(false)
const restoring = ref(false)
const error = ref('')

const stats = computed(() => backupStats(restorableBackup.value))

const savedAtText = computed(() => {
  const savedAt = stats.value.savedAt
  if (!savedAt) return ''

  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return ''

  return ` от ${date.toLocaleDateString('ru-RU')}`
})

const countsText = computed(() => {
  const { collections, links } = stats.value
  const collectionsText = `${collections} ${pluralize(collections, 'подборка', 'подборки', 'подборок')}`
  const songsText = `${links} ${pluralize(links, 'песня', 'песни', 'песен')}`

  return `${collectionsText}, ${songsText}`
})

const handleRestore = async () => {
  restoring.value = true
  error.value = ''

  try {
    await restoreFromAutoBackup()
    visible.value = false
    // Списки подборок на экранах строятся при монтировании — после
    // восстановления проще перечитать страницу, чем синхронизировать их все
    window.location.reload()
  } catch (e) {
    error.value = 'Не удалось восстановить: ' + (e?.message || 'неизвестная ошибка')
  } finally {
    restoring.value = false
  }
}

const handleDismiss = () => {
  visible.value = false
  dismissRestore()
}

onMounted(async () => {
  const backup = await checkRestorable()
  if (backup) visible.value = true
})
</script>

<style scoped>
.restore-toast {
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

.toast-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.toast-text {
  font-size: 0.9rem;
  color: var(--text);
  font-weight: 500;
}

.toast-error {
  font-size: 0.8rem;
  color: var(--danger);
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
  background: var(--bg);
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
