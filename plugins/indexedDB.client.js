import { DB_NAME, DB_VERSION, createSchema } from '~/lib/dbSchema'
import { runMigrations } from '~/lib/dbMigrations'

/**
 * Открывает базу, применяя схему и миграции.
 *
 * Никогда не реджектится: ошибку возвращает значением. Прежняя версия
 * реджектила промис, из-за чего плагин падал целиком и `provide('indexedDB')`
 * не выполнялся — приложение выглядело так, будто данных нет вообще, а причина
 * оставалась только в консоли.
 *
 * @returns {Promise<{db: IDBDatabase|null, error: string, blocked: boolean}>}
 */
const openDatabase = () => new Promise((resolve) => {
    let blocked = false

    let request
    try {
        request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
        // Приватный режим и жёсткие настройки приватности могут запретить IndexedDB
        resolve({ db: null, error: error?.message || String(error), blocked: false })
        return
    }

    request.onupgradeneeded = (event) => {
        createSchema(event.target.result)
        runMigrations(event.target.result, event.target.transaction, event.oldVersion)
    }

    // Транзакция апгрейда может откатиться (например, из-за нарушения
    // уникальности) — тогда `onerror` придёт без внятного текста, а причина
    // видна именно здесь
    request.onblocked = () => {
        blocked = true
    }

    request.onsuccess = (event) => resolve({ db: event.target.result, error: '', blocked })
    request.onerror = (event) => resolve({
        db: null,
        error: event.target.error?.message || 'Не удалось открыть базу данных',
        blocked
    })
})

/** Создаёт подборку «Избранное», если её нет (для новых установок). */
const ensureFavoriteCollection = (db) => new Promise((resolve) => {
    try {
        const transaction = db.transaction(['collections'], 'readwrite')
        const store = transaction.objectStore('collections')
        if (!store.indexNames.contains('isFavorite')) {
            resolve()
            return
        }
        const checkRequest = store.index('isFavorite').get(1)
        checkRequest.onsuccess = () => {
            if (!checkRequest.result) {
                const now = new Date().toISOString()
                // order 0 — «Избранное» всегда первым в сайдбаре
                store.add({ name: 'Избранное', isFavorite: 1, order: 0, createdAt: now, updatedAt: now })
            }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve() // не критично
    } catch (e) {
        resolve() // не критично
    }
})

/** Количество песен в базе; 0 при любой ошибке. */
const countSongs = (db) => new Promise((resolve) => {
    try {
        const request = db.transaction(['songs'], 'readonly').objectStore('songs').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(0)
    } catch (e) {
        resolve(0)
    }
})

/** Количество разделов в базе; 0 при любой ошибке. */
const countSections = (db) => new Promise((resolve) => {
    try {
        const request = db.transaction(['sections'], 'readonly').objectStore('sections').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(0)
    } catch (e) {
        resolve(0)
    }
})

export default defineNuxtPlugin(async (nuxtApp) => {
    const { setDbError, setDbAvailable, setDbBlocked } = useDbStatus()

    const { db, error, blocked } = await openDatabase()

    if (blocked) {
        setDbBlocked()
    }

    // Предоставляем БД в NuxtApp ДО авто-загрузки песен: fetchSongs() →
    // useIndexDB().addSongs() обращается к $indexedDB, поэтому provide
    // должен выполниться раньше. Иначе на свежей установке песни не грузятся.
    // При отказе базы провайдим null: useIndexDB это переживает, страницы
    // покажут пустые данные, а причина будет видна в диагностике на /about.
    nuxtApp.provide('indexedDB', db)

    if (!db) {
        setDbError(error)
        console.error('Не удалось открыть IndexedDB:', error)
        return
    }

    setDbAvailable()

    // Дальше база может закрыться (eviction, повреждение) — фиксируем причину
    db.onerror = (event) => setDbError(event.target?.error?.message || 'Ошибка базы данных')
    db.onclose = () => setDbError('База данных неожиданно закрыта')

    await ensureFavoriteCollection(db)

    // Автоматическая загрузка при пустой базе. Разделы проверяем отдельно:
    // у тех, кто обновился с прежней версии, песни на месте, а хранилища
    // разделов ещё не существовало — без догрузки группировка по разделам
    // осталась бы пустой навсегда.
    const [songsCount, sectionsCount] = await Promise.all([countSongs(db), countSections(db)])
    if (songsCount === 0 || sectionsCount === 0) {
        try {
            const { fetchSongs } = useSongs()
            await fetchSongs()
        } catch (error) {
            console.error('Ошибка автоматической загрузки песен:', error)
        }
    }
})
