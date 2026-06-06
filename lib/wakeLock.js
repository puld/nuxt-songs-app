/**
 * Чистые функции для работы с Wake Lock API.
 * Не зависят от Vue — легко тестировать.
 */

export function createWakeLockManager(settingsGetter) {
  let wakeLock = null

  const request = async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false

    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
      })
      return true
    } catch (err) {
      console.warn('Wake Lock не доступен:', err.message)
      return false
    }
  }

  const release = async () => {
    if (wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  }

  const apply = async () => {
    if (settingsGetter()) {
      await request()
    } else {
      await release()
    }
  }

  const isActive = () => !!wakeLock

  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && settingsGetter() && !wakeLock) {
      await request()
    }
  }

  return { request, release, apply, isActive, handleVisibilityChange }
}
