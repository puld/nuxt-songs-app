import { shouldCheck, checkForUpdate } from '~/lib/autoUpdate'
import { songsJsonUrl } from '~/lib/songsSource'

/**
 * Composable для автоматической проверки обновлений базы данных песен.
 *
 * При каждом запуске приложения (если онлайн и прошёл коулдаун):
 *   1. HEAD-запрос к songs.json, получает ETag
 *   2. Сравнивает с сохранённым ETag
 *   3. Если отличается — устанавливает settings.updateAvailable = true
 *
 * Пользователь подтверждает обновление через toast или настройки.
 * Применение обновления делегируется в useSongs().fetchSongs() —
 * единая точка входа, которая сама сохраняет ETag.
 */
export const useAutoUpdate = () => {
  const settings = useSettingsStore()
  const { getSongsCount } = useIndexDB()

  /**
   * Проверяет наличие обновления через ETag.
   * Вызывается при монтировании layout.
   */
  const performCheck = async () => {
    if (!navigator.onLine) return
    if (!shouldCheck(settings.lastUpdateCheck)) return

    // Если БД пуста — нет смысла проверять (автозагрузка плагином)
    const count = await getSongsCount()
    if (count === 0) return

    settings.setLastUpdateCheck(Date.now())

    const result = await checkForUpdate(
      songsJsonUrl(useRuntimeConfig().app.baseURL),
      settings.songsEtag
    )

    if (result.changed) {
      settings.setUpdateAvailable(true)
      return
    }

    // ETag неизвестен (база приехала до появления автообновления или её
    // сохранение не удалось) — запоминаем текущий. Сравнивать было не с чем,
    // и без этой записи клиент оставался бы слеп к обновлениям навсегда.
    if (!settings.songsEtag && result.newEtag) {
      settings.setSongsEtag(result.newEtag)
    }
  }

  /**
   * Применяет обновление: вызывает fetchSongs() из useSongs,
   * который загружает данные в IndexedDB и сохраняет ETag.
   *
   * @returns {Promise<boolean>} true при успехе
   */
  const applyUpdate = async () => {
    try {
      const { fetchSongs } = useSongs()
      const success = await fetchSongs()

      if (success) {
        settings.setUpdateAvailable(false)
      }

      return success
    } catch (error) {
      console.error('Ошибка применения обновления:', error)
      return false
    }
  }

  return {
    performCheck,
    applyUpdate,
    updateAvailable: computed(() => settings.updateAvailable)
  }
}
