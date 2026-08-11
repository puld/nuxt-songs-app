/**
 * Запрос постоянного хранилища (`navigator.storage.persist`).
 *
 * Зачем: IndexedDB без этого флага помечена как best-effort — браузер или ОС
 * могут освободить её при нехватке места. Это наиболее вероятная причина
 * истории, с которой началась Фаза 2: у пользователя пропали подборки, хотя
 * базу он не обновлял и кэш не чистил.
 *
 * Функции чистые: работают с переданным объектом `navigator.storage`, поэтому
 * тестируются без браузера и без моков глобалей.
 */

/** Поддерживает ли окружение постоянное хранилище. */
export const isPersistSupported = (storage) =>
    typeof storage?.persist === 'function' && typeof storage?.persisted === 'function'

/**
 * Запрашивает постоянное хранилище, если оно ещё не выдано.
 *
 * Повторный запрос при уже выданном флаге не делается: он бесполезен, а в
 * некоторых браузерах показывает пользователю лишний промпт.
 *
 * @param {StorageManager} storage - обычно `navigator.storage`
 * @returns {Promise<{supported: boolean, persisted: boolean, requested: boolean}>}
 *   `requested` — запрос действительно отправлялся (флага раньше не было)
 */
export const requestPersistentStorage = async (storage) => {
    if (!isPersistSupported(storage)) {
        return { supported: false, persisted: false, requested: false }
    }

    try {
        if (await storage.persisted()) {
            return { supported: true, persisted: true, requested: false }
        }

        const granted = await storage.persist()
        return { supported: true, persisted: !!granted, requested: true }
    } catch (e) {
        // Приватный режим и часть мобильных браузеров бросают вместо отказа.
        // Для приложения это не ошибка: просто хранилище остаётся best-effort.
        return { supported: true, persisted: false, requested: false }
    }
}

/**
 * Оценка занятого места — для блока диагностики.
 * @returns {Promise<{usage: number, quota: number}|null>} null, если API нет
 */
export const getStorageEstimate = async (storage) => {
    if (typeof storage?.estimate !== 'function') return null

    try {
        const { usage, quota } = await storage.estimate()
        return { usage: Number(usage) || 0, quota: Number(quota) || 0 }
    } catch (e) {
        return null
    }
}

/** Человекочитаемый размер: 1.4 МБ, 320 КБ. */
export const formatBytes = (bytes) => {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value < 0) return '—'
    if (value < 1024) return `${value} Б`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ГБ`
}
