/**
 * Сборка блока диагностики для страницы «О приложении».
 *
 * Зачем: на телефоне до консоли не добраться, а именно там раньше оседали
 * причины «данные пропали» — ошибка апгрейда базы, отсутствие постоянного
 * хранилища, пустая резервная копия. Блок делает это состояние видимым
 * без инструментов разработчика.
 *
 * Функции чистые: принимают уже собранные значения и возвращают строки для
 * шаблона, поэтому проверяются без браузера и без IndexedDB.
 */
import { formatBytes } from './storagePersist'

/** Постоянное хранилище: понятная строка вместо `true/false/null`. */
export const formatPersisted = (state) => {
    if (!state || !state.supported) return 'браузер не поддерживает'
    if (state.persisted === null || state.persisted === undefined) return 'не проверялось'
    return state.persisted ? 'да' : 'нет'
}

/** Занятое место и квота; «—», если оценки нет. */
export const formatEstimate = (estimate) => {
    if (!estimate) return '—'
    return `${formatBytes(estimate.usage)} из ${formatBytes(estimate.quota)}`
}

/**
 * Дата из ISO в привычном виде 11.08.2026.
 * Форматируем вручную, а не через `toLocaleDateString`: результат не должен
 * зависеть от локали устройства — эту строку пользователь пересылает как есть.
 */
export const formatIsoDate = (iso) => {
    if (!iso) return ''

    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''

    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

/** Состояние резервной копии подборок в localStorage. */
export const formatBackup = (stats) => {
    if (!stats || !stats.collections) return 'нет'

    const date = formatIsoDate(stats.savedAt)
    const counts = `${stats.collections} / ${stats.links}`

    return date ? `от ${date}, подборок / песен: ${counts}` : `подборок / песен: ${counts}`
}

/**
 * Строки блока диагностики.
 *
 * `dev: true` — строка нужна только при разборе проблемы и показывается лишь
 * в режиме разработчика; остальные понятны любому и годятся для «пришлите
 * скриншот». Ошибка базы сюда не входит: она выводится отдельно и всегда.
 *
 * @returns {Array<{label: string, value: string, dev: boolean}>}
 */
export const buildDiagnostics = ({
    songs = 0,
    collections = 0,
    links = 0,
    dbVersion = null,
    persisted = null,
    estimate = null,
    backup = null
} = {}) => [
    { label: 'Песен в базе', value: String(songs), dev: false },
    { label: 'Подборок', value: String(collections), dev: false },
    { label: 'Песен в подборках', value: String(links), dev: false },
    { label: 'Постоянное хранилище', value: formatPersisted(persisted), dev: false },
    { label: 'Резервная копия', value: formatBackup(backup), dev: false },
    { label: 'Версия базы', value: dbVersion ? String(dbVersion) : 'база недоступна', dev: true },
    { label: 'Занято места', value: formatEstimate(estimate), dev: true }
]
