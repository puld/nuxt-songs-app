import { ref } from 'vue'
import { useIndexDB } from './useIndexDB'
import {
    readBackupFrom,
    clearBackupIn,
    isTrivialBackup,
    parseBackup,
    planImport,
    serializeBackup,
    buildBackup,
    backupStats
} from '~/lib/collectionsBackup'

/**
 * Работа с резервной копией подборок: восстановление, экспорт, импорт.
 *
 * Снятие автокопии живёт в `useIndexDB` (там же, где мутации), здесь —
 * всё, что делает пользователь осознанно.
 *
 * Состояние модульное: предложение восстановиться проверяется один раз за
 * сессию в layout, а показывается компонентом.
 */

/** Копия, которую предлагается восстановить (null — предлагать нечего). */
const restorableBackup = ref(null)

/** Проверка уже выполнялась — второй раз за сессию не спрашиваем. */
let checked = false

const storage = () => (typeof localStorage === 'undefined' ? null : localStorage)

export const resetCollectionsBackupState = () => {
    restorableBackup.value = null
    checked = false
}

export const useCollectionsBackup = () => {
    const db = useIndexDB()

    /** Разобранная автокопия из localStorage или null. */
    const readBackup = () => {
        const result = readBackupFrom(storage())
        return result.ok ? result.backup : null
    }

    /**
     * Есть ли смысл предлагать восстановление.
     *
     * Условие намеренно узкое: копия содержательна, а в базе подборок с
     * песнями нет. Так предложение появляется только после реальной потери,
     * а не у пользователя, который сам удалил свои подборки и добавил новые.
     */
    const checkRestorable = async () => {
        if (checked) return restorableBackup.value
        checked = true

        const backup = readBackup()
        if (!backup || isTrivialBackup(backup)) return null

        const links = await db.getAllLinks()
        if (links.length > 0) return null

        const collections = await db.getCollections()
        const userCollections = collections.filter((collection) => collection.isFavorite !== 1)
        if (userCollections.length > 0) return null

        restorableBackup.value = backup
        return backup
    }

    /** Отказ от восстановления: копию удаляем, чтобы не спрашивать снова. */
    const dismissRestore = () => {
        clearBackupIn(storage())
        restorableBackup.value = null
    }

    /**
     * Применяет копию к базе: недостающие подборки создаёт, существующие
     * дополняет. Ничего не удаляет — импорт только добавляет.
     *
     * @returns {Promise<{collections: number, songs: number, skipped: number}>}
     */
    const applyBackup = async (backup) => {
        const existing = await db.getCollections()
        const plan = planImport(backup, existing)

        let createdCollections = 0
        let addedSongs = 0
        let skipped = 0

        for (const item of plan) {
            let targetId = item.targetId

            if (!targetId) {
                // «Избранное» сюда попадает только если его нет в базе вовсе —
                // тогда создаём обычную подборку с тем же именем: данные важнее
                // системного флага, а само «Избранное» пересоздаст плагин
                targetId = await db.createCollection(item.name)
                createdCollections++
            }

            for (const link of item.links) {
                try {
                    await db.addSongToCollection(targetId, link.songNumber, link.variantIndex)
                    addedSongs++
                } catch (e) {
                    // Песня уже в подборке — при слиянии это норма
                    skipped++
                }
            }
        }

        return { collections: createdCollections, songs: addedSongs, skipped }
    }

    /** Восстановление из автокопии по кнопке в предложении. */
    const restoreFromAutoBackup = async () => {
        const backup = restorableBackup.value || readBackup()
        if (!backup) throw new Error('Резервная копия не найдена')

        const result = await applyBackup(backup)
        restorableBackup.value = null
        return result
    }

    /** Текст файла экспорта: снимок текущего состояния базы. */
    const exportToText = async () => {
        const [collections, links] = await Promise.all([db.getCollections(), db.getAllLinks()])
        const backup = buildBackup(collections, links, new Date().toISOString())

        return { text: serializeBackup(backup), backup, stats: backupStats(backup) }
    }

    /**
     * Импорт из файла.
     * @returns {Promise<{ok: boolean, error: string, result: object|null}>}
     */
    const importFromText = async (text) => {
        const parsed = parseBackup(text)
        if (!parsed.ok) return { ok: false, error: parsed.error, result: null }

        const result = await applyBackup(parsed.backup)
        return { ok: true, error: '', result }
    }

    return {
        restorableBackup,
        readBackup,
        checkRestorable,
        dismissRestore,
        restoreFromAutoBackup,
        applyBackup,
        exportToText,
        importFromText
    }
}
