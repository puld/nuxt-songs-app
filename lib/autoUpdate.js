/**
 * Автообновление базы данных песен.
 *
 * Механизм (на основе ETag):
 *   1. При загрузке песен — сохранить ETag из HTTP-ответа
 *   2. При следующем запуске — HEAD-запрос к songs.json, сравнить ETag
 *   3. Если ETag отличается — сигнализировать о доступном обновлении
 *   4. Пользователь подтверждает — полный GET + загрузка в IndexedDB
 *
 * Преимущество ETag: HEAD-запрос скачивает 0 байт при отсутствии изменений.
 * GitHub Pages полностью поддерживает ETag и условные запросы (304).
 *
 * Коулдаун: проверка не чаще одного раза в 30 минут.
 */

const COOLDOWN_MS = 30 * 60 * 1000 // 30 минут

/**
 * Проверяет, нужно ли выполнять проверку обновлений
 * (по коулдауну с предыдущей проверки).
 *
 * @param {number|null} lastCheckTime — timestamp последней проверки (ms)
 * @param {number} [cooldownMs] — минимальный интервал между проверками (ms)
 * @returns {boolean} true если проверку нужно выполнить
 */
export function shouldCheck(lastCheckTime, cooldownMs = COOLDOWN_MS) {
  if (!lastCheckTime) return true
  return Date.now() - lastCheckTime >= cooldownMs
}

/**
 * Проверяет наличие обновления songs.json через ETag.
 * Выполняет HEAD-запрос — не скачивает тело файла.
 *
 * @param {string} url — URL файла songs.json
 * @param {string} storedEtag — сохранённый ETag (пустая строка = первый запуск)
 * @returns {Promise<{changed: boolean, newEtag: string}>}
 *   changed — true если ETag отличается (обновление доступно)
 *   newEtag — ETag из ответа (или storedEtag при ошибке)
 */
export async function checkForUpdate(url, storedEtag) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) {
      return { changed: false, newEtag: storedEtag }
    }

    const newEtag = response.headers.get('etag') || ''

    // Нет ETag от сервера или первый запуск — не считаем обновлением
    if (!storedEtag || !newEtag) {
      return { changed: false, newEtag }
    }

    // ETag совпадает — обновления нет
    if (newEtag === storedEtag) {
      return { changed: false, newEtag }
    }

    // ETag отличается — обновление доступно
    return { changed: true, newEtag }
  } catch {
    // Ошибка сети — ничего не делаем
    return { changed: false, newEtag: storedEtag }
  }
}
