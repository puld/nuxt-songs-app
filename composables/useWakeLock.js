import { useSettingsStore } from '~/stores/settings'
import { createWakeLockManager } from '~/lib/wakeLock'

export function useWakeLock() {
  const settings = useSettingsStore()
  const manager = createWakeLockManager(() => settings.keepScreenOn)

  // Слежение за изменением настройки
  watch(() => settings.keepScreenOn, async (enabled) => {
    if (enabled) {
      await manager.request()
    } else {
      await manager.release()
    }
  })

  // Повторный запрос при возвращении на вкладку (wakeLock снимается при уходе)
  if (import.meta.client) {
    document.addEventListener('visibilitychange', manager.handleVisibilityChange)
  }

  return {
    request: manager.request,
    release: manager.release,
    apply: manager.apply
  }
}
