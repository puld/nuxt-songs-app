import { useSettingsStore } from '~/stores/settings'

/**
 * Общая логика для layout'ов: скрытие навбара при скролле,
 * wake lock, автообновление, синхронизация класса шрифта.
 */
export const useLayoutCommon = () => {
  const settings = useSettingsStore()
  const showNavbar = ref(true)
  const lastScrollY = ref(0)
  const scrollOffset = 100

  // Автообновление базы данных
  const autoUpdate = useAutoUpdate()
  const showToast = ref(false)

  // Wake Lock: не гасить экран
  const wakeLock = useWakeLock()

  const onScroll = () => {
    const currentScrollY = window.scrollY

    if (currentScrollY < scrollOffset) {
      showNavbar.value = true
    } else if (currentScrollY > lastScrollY.value && currentScrollY > scrollOffset) {
      showNavbar.value = false
    } else if (currentScrollY < lastScrollY.value) {
      showNavbar.value = true
    }

    lastScrollY.value = currentScrollY
  }

  const onUpdateApplied = () => {
    showToast.value = false
  }

  const manifestHref = useRuntimeConfig().app.baseURL + 'manifest.webmanifest'

  useHead({
    link: [
      { rel: 'manifest', href: manifestHref },
      { rel: 'apple-touch-icon', href: useRuntimeConfig().app.baseURL + 'apple-touch-icon.png' }
    ]
  })

  onMounted(() => {
    wakeLock.apply()

    // Проверяем обновление базы данных
    autoUpdate.performCheck().then(() => {
      if (autoUpdate.updateAvailable.value) {
        showToast.value = true
      }
    })

    window.addEventListener('scroll', onScroll, { passive: true })

    // Синхронизируем класс размера шрифта на <html>
    const updateFontClass = () => {
      document.documentElement.classList.remove('font-size-small', 'font-size-medium', 'font-size-large')
      document.documentElement.classList.add(`font-size-${settings.fontSize}`)
    }
    updateFontClass()
    watch(() => settings.fontSize, updateFontClass)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
  })

  return {
    showNavbar,
    autoUpdate,
    showToast,
    onUpdateApplied
  }
}
