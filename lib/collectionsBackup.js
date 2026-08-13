/**
 * Резервная копия подборок: сборка, разбор и план импорта.
 *
 * Зачем: подборки живут только в IndexedDB, которую браузер вправе освободить.
 * Данные крошечные (имена и пары «подборка — песня»), поэтому копия целиком
 * помещается в localStorage — отдельное хранилище, которое чистится другими
 * механизмами и переживает eviction IndexedDB.
 *
 * Копируются только подборки и связи. Тексты песен не копируются: они
 * восстанавливаются из `songs.json`, а копия должна оставаться маленькой.
 *
 * Всё здесь — чистые функции: чтение базы и запись в localStorage делают
 * `useIndexDB` и `useCollectionsBackup`.
 */

/** Версия формата копии. Растёт при несовместимом изменении структуры. */
export const BACKUP_VERSION = 1

/** Ключ автокопии в localStorage. */
export const BACKUP_STORAGE_KEY = 'collectionsBackup'

/** Приводит имя к виду, по которому подборки считаются одной и той же. */
const normalizeName = (name) => String(name ?? '').trim().toLowerCase()

/** Оставляет у подборки только то, что нужно для восстановления. */
const pickCollection = (collection) => {
    const name = String(collection?.name ?? '').trim()
    if (!name) return null

    const result = { id: Number(collection.id), name }
    if (collection.isFavorite === 1) result.isFavorite = 1
    if (collection.createdAt) result.createdAt = String(collection.createdAt)
    if (collection.updatedAt) result.updatedAt = String(collection.updatedAt)

    return Number.isInteger(result.id) && result.id > 0 ? result : null
}

/** Оставляет у связи только ключевые поля; мусор отбрасывает. */
const pickLink = (link) => {
    const collectionId = Number(link?.collectionId)
    const songNumber = Number(link?.songNumber)
    if (!Number.isInteger(collectionId) || collectionId <= 0) return null
    if (!Number.isInteger(songNumber) || songNumber <= 0) return null

    let variantIndex = Number(link.variantIndex)
    if (!Number.isInteger(variantIndex) || variantIndex < 0) variantIndex = 0

    return {
        collectionId,
        songNumber,
        variantIndex,
        addedAt: link.addedAt ? String(link.addedAt) : undefined
    }
}

/**
 * Собирает копию из содержимого базы.
 *
 * @param {Array} collections - записи `collections`
 * @param {Array} links - записи `songCollections`
 * @param {string} savedAt - ISO-дата снятия копии
 */
export const buildBackup = (collections, links, savedAt) => {
    const validCollections = (collections || []).map(pickCollection).filter(Boolean)
    const knownIds = new Set(validCollections.map((collection) => collection.id))

    return {
        v: BACKUP_VERSION,
        savedAt: String(savedAt),
        collections: validCollections,
        // Связи-сироты (подборки уже нет) не переносим — восстанавливать их некуда
        links: (links || []).map(pickLink).filter((link) => link && knownIds.has(link.collectionId))
    }
}

/** Копия без единой подборки — восстанавливать нечего. */
export const isEmptyBackup = (backup) => !backup?.collections?.length

/**
 * Копия, в которой есть только пустое «Избранное».
 *
 * Такую копию нельзя предлагать к восстановлению: она появляется у любого
 * пользователя сразу после установки и перезаписала бы осмысленную старую.
 */
export const isTrivialBackup = (backup) => {
    if (isEmptyBackup(backup)) return true
    if (backup.links?.length) return false
    return backup.collections.every((collection) => collection.isFavorite === 1)
}

/** Сводка для интерфейса: сколько подборок и песен в копии. */
export const backupStats = (backup) => ({
    collections: backup?.collections?.length || 0,
    links: backup?.links?.length || 0,
    savedAt: backup?.savedAt || ''
})

export const serializeBackup = (backup) => JSON.stringify(backup, null, 2)

/**
 * Разбирает копию из текста (localStorage или файл).
 * Никогда не бросает — ошибку возвращает значением.
 *
 * @returns {{ok: boolean, backup: object|null, error: string}}
 */
export const parseBackup = (text) => {
    if (!text || typeof text !== 'string') {
        return { ok: false, backup: null, error: 'Пустой файл' }
    }

    let raw
    try {
        raw = JSON.parse(text)
    } catch (e) {
        return { ok: false, backup: null, error: 'Файл повреждён или это не резервная копия' }
    }

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.collections)) {
        return { ok: false, backup: null, error: 'Это не резервная копия подборок' }
    }

    const version = Number(raw.v)
    if (Number.isInteger(version) && version > BACKUP_VERSION) {
        return {
            ok: false,
            backup: null,
            error: 'Копия сделана более новой версией приложения — обновите приложение'
        }
    }

    // Пересобираем через buildBackup: он же и валидирует записи
    const backup = buildBackup(raw.collections, Array.isArray(raw.links) ? raw.links : [], raw.savedAt || '')

    if (isEmptyBackup(backup)) {
        return { ok: false, backup: null, error: 'В копии нет подборок' }
    }

    return { ok: true, backup, error: '' }
}

/**
 * План восстановления: что создать, что слить с существующим.
 *
 * Подборки сопоставляются по имени без учёта регистра и пробелов по краям —
 * «Избранное» ищется по флагу `isFavorite`, а не по имени: пользователь мог
 * переименовать её на другом устройстве.
 *
 * Связи не удаляются и не заменяются: импорт только добавляет. Иначе
 * восстановление старой копии стирало бы то, что появилось после неё.
 *
 * @param {object} backup - разобранная копия
 * @param {Array} existingCollections - подборки, которые уже есть в базе
 * @returns {Array<{name: string, isFavorite: boolean, action: 'create'|'merge', targetId: number|null, links: Array}>}
 */
export const planImport = (backup, existingCollections = []) => {
    const linksByCollection = new Map()
    for (const link of backup?.links || []) {
        if (!linksByCollection.has(link.collectionId)) linksByCollection.set(link.collectionId, [])
        linksByCollection.get(link.collectionId).push(link)
    }

    const existingFavorite = existingCollections.find((collection) => collection.isFavorite === 1)
    const existingByName = new Map(
        existingCollections
            .filter((collection) => collection.isFavorite !== 1)
            .map((collection) => [normalizeName(collection.name), collection])
    )

    return (backup?.collections || []).map((collection) => {
        const isFavorite = collection.isFavorite === 1
        const target = isFavorite ? existingFavorite : existingByName.get(normalizeName(collection.name))
        const links = (linksByCollection.get(collection.id) || []).map(({ songNumber, variantIndex }) => ({
            songNumber,
            variantIndex
        }))

        return {
            name: collection.name,
            isFavorite,
            action: target ? 'merge' : 'create',
            targetId: target ? target.id : null,
            links
        }
    })
}

/** Имя файла экспорта: `podborki-2026-08-11.json`. */
export const backupFileName = (isoDate) => {
    const date = String(isoDate || '').slice(0, 10) || 'backup'
    return `podborki-${date}.json`
}

/**
 * Можно ли заменить текущую копию новой.
 *
 * Главное правило: осмысленная копия не затирается пустой. Если IndexedDB
 * освободили, приложение начинает с чистой базы — и первое же изменение
 * подборок стёрло бы единственный след прежних данных.
 */
export const shouldReplaceBackup = (nextBackup, currentBackup) => {
    if (isEmptyBackup(nextBackup)) return false
    if (!currentBackup || isTrivialBackup(currentBackup)) return true
    return !isTrivialBackup(nextBackup)
}

/**
 * Читает автокопию из хранилища.
 * Хранилище передаётся аргументом — функция работает и в тестах, и там,
 * где localStorage недоступен (приватный режим бросает уже на чтении).
 *
 * @param {Storage} storage - обычно `localStorage`
 * @returns {{ok: boolean, backup: object|null, error: string}}
 */
export const readBackupFrom = (storage) => {
    let raw
    try {
        raw = storage?.getItem(BACKUP_STORAGE_KEY)
    } catch (e) {
        return { ok: false, backup: null, error: 'Хранилище недоступно' }
    }

    if (!raw) return { ok: false, backup: null, error: 'Копии нет' }

    return parseBackup(raw)
}

/**
 * Сохраняет копию, если она не хуже уже лежащей.
 *
 * @returns {{saved: boolean, reason: string}} `reason` — почему пропустили
 */
export const saveBackupTo = (storage, backup) => {
    if (!storage) return { saved: false, reason: 'Хранилище недоступно' }

    const current = readBackupFrom(storage)
    if (!shouldReplaceBackup(backup, current.ok ? current.backup : null)) {
        return { saved: false, reason: 'Текущая копия содержательнее' }
    }

    try {
        storage.setItem(BACKUP_STORAGE_KEY, serializeBackup(backup))
        return { saved: true, reason: '' }
    } catch (e) {
        // Переполнение квоты или приватный режим — не повод ронять сохранение
        // подборки, ради которого копия и снималась
        return { saved: false, reason: 'Не удалось записать копию' }
    }
}

/** Удаляет автокопию (например, после отказа от восстановления). */
export const clearBackupIn = (storage) => {
    try {
        storage?.removeItem(BACKUP_STORAGE_KEY)
    } catch (e) {
        // Нечего делать: копия и так недоступна
    }
}
