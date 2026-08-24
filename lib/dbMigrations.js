import { initialOrderPlan } from './collectionsOrder.js'

/**
 * Миграции IndexedDB — вынесены из плагина, чтобы их можно было прогонять
 * в тестах на fake-indexeddb.
 *
 * Схема (хранилища и индексы «с нуля») живёт в `lib/dbSchema.js`; здесь — только
 * приведение данных и индексов существующей базы к текущей версии.
 *
 * ## Почему шаги идемпотентны, а не «лестница версий»
 *
 * Прежняя реализация была лестницей (v1→v2, v2→v3, …), и шаги пересекались:
 * v3→v4 создавал уникальный индекс `collectionId_songNumber_variantIndex`
 * внутри асинхронного колбэка, а v5→v6 проверял его наличие синхронно — то есть
 * видел, что индекса ещё нет, и создавал его сам. Второй `createIndex` с тем же
 * именем ронял транзакцию апгрейда.
 *
 * Поэтому шаги описывают **целевое состояние** и безопасны при повторном
 * выполнении: проверяют, что уже есть, и доводят до нужного вида.
 *
 * ## Почему шаги последовательны, а не параллельны
 *
 * Порядок критичен: нормализовать связи нужно ДО создания уникального индекса,
 * иначе дубли роняют апгрейд (см. `normalizeLinks`). Между шагами нельзя
 * использовать `await`: пауза без активных запросов закрывает транзакцию
 * апгрейда. Поэтому шаги связаны колбэками — следующий стартует из колбэка
 * предыдущего, пока транзакция ещё активна.
 */

/**
 * Последовательно выполняет шаги миграции.
 * @param {Array<Function>} steps - шаги вида (ctx, next) => void
 * @param {object} ctx - контекст (db, transaction)
 * @param {Function} [done] - вызывается после последнего шага
 */
const runSteps = (steps, ctx, done) => {
    let index = 0

    const next = () => {
        if (index >= steps.length) {
            done?.()
            return
        }
        const step = steps[index++]
        step(ctx, next)
    }

    next()
}

/**
 * v1→v2: у песни `body` заменяется на `variants: [{ label: '', body }]`.
 *
 * Обход курсором с `update` вместо прежнего `clear()` + повторный `put`:
 * при `clear()` данные исчезали до записи новых, и любой сбой в середине
 * оставлял хранилище пустым.
 */
const migrateSongsToVariants = ({ transaction }, next) => {
    const store = transaction.objectStore('songs')
    const request = store.openCursor()

    request.onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) {
            next()
            return
        }

        const song = cursor.value
        if (song && song.body && !song.variants) {
            cursor.update({
                number: song.number,
                title: song.title,
                variants: [{ label: '', body: song.body }]
            })
        }
        cursor.continue()
    }
    request.onerror = () => next()
}

/**
 * Снимает уникальность с индекса `collectionId_songNumber`.
 *
 * До v3 он был уникальным и запрещал держать в подборке два варианта одной
 * песни. Уникальность теперь у составного индекса с `variantIndex`.
 */
const relaxSongNumberIndex = ({ transaction }, next) => {
    const store = transaction.objectStore('songCollections')

    if (store.indexNames.contains('collectionId_songNumber')) {
        if (!store.index('collectionId_songNumber').unique) {
            next()
            return
        }
        store.deleteIndex('collectionId_songNumber')
    }

    store.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: false })
    next()
}

/**
 * Убирает индексы, которые мешают нормализации связей.
 *
 * `collectionId_songNumber_variantLabel` — наследие v3, поле `variantLabel`
 * больше не существует. Уникальный `collectionId_songNumber_variantIndex`
 * снимается временно: пока он висит, любое приведение `variantIndex` к числу
 * может нарушить уникальность и оборвать апгрейд. Индекс создаётся заново
 * после нормализации — в `createUniqueLinkIndex`.
 */
const dropLinkIndexes = ({ transaction }, next) => {
    const store = transaction.objectStore('songCollections')

    for (const name of ['collectionId_songNumber_variantLabel', 'collectionId_songNumber_variantIndex']) {
        if (store.indexNames.contains(name)) {
            store.deleteIndex(name)
        }
    }
    next()
}

/**
 * Приводит связи к виду `{ collectionId, songNumber, variantIndex, addedAt }`
 * и разводит записи, которые после приведения дают одинаковый ключ.
 *
 * Это и есть место, где раньше падал апгрейд. До v4 ключ связи включал
 * `variantLabel`, поэтому одна песня легально лежала в подборке в двух
 * вариантах. Прежняя миграция переписывала всем `variantIndex: 0` — два ключа
 * схлопывались в один, создание уникального индекса давало `ConstraintError`,
 * транзакция апгрейда откатывалась целиком, и приложение выглядело так, будто
 * данных нет вообще.
 *
 * Дубликаты не удаляются, а сдвигаются на первый свободный `variantIndex`:
 * метка варианта в тот момент уже потеряна, но сама связь «песня в подборке»
 * сохраняется — пользователь увидит песню в подборке, пусть и на варианте,
 * который придётся поправить руками. Удаление было бы молчаливой потерей.
 *
 * Записи без пригодных `collectionId`/`songNumber` удаляются: они не ссылаются
 * ни на что и всё равно не попали бы в индекс.
 */
const normalizeLinks = ({ transaction }, next) => {
    const store = transaction.objectStore('songCollections')
    const usedKeys = new Set()
    const request = store.openCursor()

    // `Number(null)` и `Number('')` дают 0, поэтому проверять только на NaN мало:
    // ключи автоинкрементные и начинаются с единицы, значит 0 — тоже мусор.
    const toKeyPart = (value) => {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    request.onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) {
            next()
            return
        }

        const link = cursor.value
        const collectionId = toKeyPart(link.collectionId)
        const songNumber = toKeyPart(link.songNumber)

        if (collectionId === null || songNumber === null) {
            cursor.delete()
            cursor.continue()
            return
        }

        let variantIndex = Number(link.variantIndex)
        if (!Number.isInteger(variantIndex) || variantIndex < 0) {
            variantIndex = 0
        }
        while (usedKeys.has(`${collectionId}:${songNumber}:${variantIndex}`)) {
            variantIndex++
        }
        usedKeys.add(`${collectionId}:${songNumber}:${variantIndex}`)

        cursor.update({
            id: link.id,
            collectionId,
            songNumber,
            variantIndex,
            addedAt: link.addedAt || new Date().toISOString()
        })
        cursor.continue()
    }
    request.onerror = () => next()
}

/** Создаёт уникальный индекс связей — только после `normalizeLinks`. */
const createUniqueLinkIndex = ({ transaction }, next) => {
    const store = transaction.objectStore('songCollections')

    if (!store.indexNames.contains('collectionId_songNumber_variantIndex')) {
        store.createIndex(
            'collectionId_songNumber_variantIndex',
            ['collectionId', 'songNumber', 'variantIndex'],
            { unique: true }
        )
    }
    next()
}

/** Индекс `isFavorite` в `collections` — по нему находится системная подборка. */
const ensureFavoriteIndex = ({ transaction }, next) => {
    const store = transaction.objectStore('collections')

    if (!store.indexNames.contains('isFavorite')) {
        store.createIndex('isFavorite', 'isFavorite', { unique: false })
    }
    next()
}

/**
 * Создаёт подборку «Избранное», если её нет.
 * Она обычная запись в `collections` с `isFavorite: 1`, а не отдельное хранилище.
 */
const ensureFavoriteCollection = ({ transaction }, next) => {
    const store = transaction.objectStore('collections')
    const request = store.index('isFavorite').get(1)

    request.onsuccess = () => {
        if (!request.result) {
            const now = new Date().toISOString()
            store.add({ name: 'Избранное', isFavorite: 1, createdAt: now, updatedAt: now })
        }
        next()
    }
    request.onerror = () => next()
}

/**
 * Проставляет `order` подборкам, у которых его нет.
 *
 * Порядок берётся текущий — тот, что пользователь уже видел в сайдбаре:
 * «Избранное» первым, остальные по дате создания. Пересортировать базу при
 * обновлении нельзя: список молча перетасовался бы.
 *
 * Идемпотентность держится на `initialOrderPlan`: он возвращает только те
 * записи, где `order` не совпал с позицией, поэтому повторный апгрейд не
 * делает ни одной записи.
 *
 * Идёт последним шагом — после `ensureFavoriteCollection`, иначе только что
 * созданное «Избранное» осталось бы без `order` до следующего апгрейда.
 */
const ensureCollectionsOrder = ({ transaction }, next) => {
    const store = transaction.objectStore('collections')
    const request = store.getAll()

    request.onsuccess = () => {
        const collections = request.result || []
        const plan = initialOrderPlan(collections)

        if (!plan.length) {
            next()
            return
        }

        const byId = new Map(collections.map((item) => [item.id, item]))
        let index = 0

        // Записи идут цепочкой колбэков: пауза без активных запросов закрыла бы
        // транзакцию апгрейда.
        const writeNext = () => {
            if (index >= plan.length) {
                next()
                return
            }

            const { id, order } = plan[index++]
            const record = byId.get(id)

            if (!record) {
                writeNext()
                return
            }

            const put = store.put({ ...record, order })
            put.onsuccess = writeNext
            put.onerror = writeNext
        }

        writeNext()
    }
    request.onerror = () => next()
}

/**
 * Приводит существующую базу к текущей версии схемы.
 *
 * Вызывать из `onupgradeneeded` после `createSchema(db)`: хранилища к этому
 * моменту должны существовать. На свежей базе (`oldVersion === 0`) миграции не
 * нужны — `createSchema` уже создал всё в целевом виде.
 *
 * @param {IDBDatabase} db - база в состоянии апгрейда
 * @param {IDBTransaction} transaction - транзакция версии (`request.transaction`)
 * @param {number} oldVersion - версия, с которой обновляемся
 * @param {Function} [done] - колбэк после последнего шага (для тестов)
 */
export const runMigrations = (db, transaction, oldVersion, done) => {
    if (!oldVersion) {
        done?.()
        return
    }

    const steps = []

    if (oldVersion < 2) {
        steps.push(migrateSongsToVariants)
    }

    // Связи и индексы проверяются на любой старой версии: шаги идемпотентны,
    // а связей единицы-десятки — обход курсором дешевле, чем риск оставить
    // базу с индексом, не соответствующим данным.
    steps.push(
        relaxSongNumberIndex,
        dropLinkIndexes,
        normalizeLinks,
        createUniqueLinkIndex,
        ensureFavoriteIndex,
        ensureFavoriteCollection,
        ensureCollectionsOrder
    )

    runSteps(steps, { db, transaction }, done)
}
