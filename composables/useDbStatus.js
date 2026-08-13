/**
 * Состояние доступности IndexedDB — общее для всего приложения.
 *
 * Зачем: раньше ошибка открытия базы реджектила плагин, `provide('indexedDB')`
 * не выполнялся, и приложение выглядело полностью сломанным — а сообщение
 * уходило только в консоль, до которой на телефоне не добраться. Теперь плагин
 * записывает ошибку сюда, приложение продолжает работать в урезанном виде,
 * а текст ошибки видно в блоке диагностики на странице «О приложении».
 *
 * Состояние модульное (объявлено вне фабрики) — все вызовы `useDbStatus()`
 * работают с одними и теми же ref.
 */
import { ref } from 'vue'

/** Текст ошибки открытия базы, пустая строка — ошибки не было. */
const dbError = ref('')

/** База открыта и доступна. */
const dbAvailable = ref(false)

/** Открытие заблокировано другой вкладкой с устаревшей версией. */
const dbBlocked = ref(false)

/**
 * Результат запроса постоянного хранилища:
 * `null` — не проверяли, `false` — браузер не дал или не поддерживает.
 */
const storagePersisted = ref(null)

export const useDbStatus = () => {
    const setDbError = (message) => {
        dbError.value = String(message || 'Неизвестная ошибка базы данных')
        dbAvailable.value = false
    }

    const setDbAvailable = () => {
        dbError.value = ''
        dbAvailable.value = true
        dbBlocked.value = false
    }

    const setDbBlocked = () => {
        dbBlocked.value = true
    }

    const setStoragePersisted = (value) => {
        storagePersisted.value = value
    }

    return {
        dbError,
        dbAvailable,
        dbBlocked,
        storagePersisted,
        setDbError,
        setDbAvailable,
        setDbBlocked,
        setStoragePersisted
    }
}

/** Сброс состояния — только для тестов. */
export const resetDbStatus = () => {
    dbError.value = ''
    dbAvailable.value = false
    dbBlocked.value = false
    storagePersisted.value = null
}
