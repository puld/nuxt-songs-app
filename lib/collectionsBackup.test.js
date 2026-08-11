import { describe, it, expect } from 'vitest'
import {
    BACKUP_VERSION,
    buildBackup,
    isEmptyBackup,
    isTrivialBackup,
    backupStats,
    serializeBackup,
    parseBackup,
    planImport,
    backupFileName,
    shouldReplaceBackup,
    readBackupFrom,
    saveBackupTo,
    clearBackupIn
} from './collectionsBackup'

const collections = [
    { id: 1, name: 'Избранное', isFavorite: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 2, name: 'Пасха', createdAt: '2026-02-01T00:00:00.000Z' }
]

const links = [
    { id: 10, collectionId: 1, songNumber: 115, variantIndex: 0, addedAt: '2026-03-01T00:00:00.000Z' },
    { id: 11, collectionId: 2, songNumber: 220, variantIndex: 1, addedAt: '2026-03-02T00:00:00.000Z' }
]

describe('buildBackup', () => {
    it('собирает подборки и связи', () => {
        const backup = buildBackup(collections, links, '2026-08-11T10:00:00.000Z')

        expect(backup.v).toBe(BACKUP_VERSION)
        expect(backup.savedAt).toBe('2026-08-11T10:00:00.000Z')
        expect(backup.collections).toHaveLength(2)
        expect(backup.collections[0]).toMatchObject({ id: 1, name: 'Избранное', isFavorite: 1 })
        expect(backup.links).toHaveLength(2)
        expect(backup.links[1]).toMatchObject({ collectionId: 2, songNumber: 220, variantIndex: 1 })
    })

    it('обычная подборка не получает флаг isFavorite', () => {
        const backup = buildBackup(collections, [], '2026-08-11T10:00:00.000Z')

        expect(backup.collections[1].isFavorite).toBeUndefined()
    })

    it('связи-сироты не попадают в копию', () => {
        const orphan = { id: 12, collectionId: 99, songNumber: 300, variantIndex: 0 }
        const backup = buildBackup(collections, [...links, orphan], '2026-08-11T10:00:00.000Z')

        expect(backup.links).toHaveLength(2)
        expect(backup.links.some((link) => link.collectionId === 99)).toBe(false)
    })

    it('битые записи отбрасываются', () => {
        const backup = buildBackup(
            [...collections, { id: 3, name: '   ' }, { id: 0, name: 'Нулевой id' }, null],
            [
                ...links,
                { collectionId: 1, songNumber: null },
                { collectionId: null, songNumber: 5 },
                { collectionId: 2, songNumber: 'абв' }
            ],
            '2026-08-11T10:00:00.000Z'
        )

        expect(backup.collections).toHaveLength(2)
        expect(backup.links).toHaveLength(2)
    })

    it('отсутствующий variantIndex становится нулём', () => {
        const backup = buildBackup(collections, [{ collectionId: 1, songNumber: 7 }], '2026-08-11T10:00:00.000Z')

        expect(backup.links[0].variantIndex).toBe(0)
    })

    it('пустые входные данные не роняют сборку', () => {
        const backup = buildBackup(null, null, '')

        expect(backup.collections).toEqual([])
        expect(backup.links).toEqual([])
    })
})

describe('isEmptyBackup / isTrivialBackup', () => {
    it('копия без подборок пуста и тривиальна', () => {
        const backup = buildBackup([], [], '2026-08-11T10:00:00.000Z')

        expect(isEmptyBackup(backup)).toBe(true)
        expect(isTrivialBackup(backup)).toBe(true)
    })

    it('одно пустое «Избранное» — тривиальная копия', () => {
        const backup = buildBackup([collections[0]], [], '2026-08-11T10:00:00.000Z')

        expect(isEmptyBackup(backup)).toBe(false)
        // Такая копия появляется у любого свежего клиента и не должна
        // затирать осмысленную старую
        expect(isTrivialBackup(backup)).toBe(true)
    })

    it('«Избранное» с песнями тривиальным не считается', () => {
        const backup = buildBackup([collections[0]], [links[0]], '2026-08-11T10:00:00.000Z')

        expect(isTrivialBackup(backup)).toBe(false)
    })

    it('пустая пользовательская подборка тривиальной не считается', () => {
        const backup = buildBackup([collections[1]], [], '2026-08-11T10:00:00.000Z')

        expect(isTrivialBackup(backup)).toBe(false)
    })
})

describe('backupStats', () => {
    it('считает подборки и связи', () => {
        const backup = buildBackup(collections, links, '2026-08-11T10:00:00.000Z')

        expect(backupStats(backup)).toEqual({
            collections: 2,
            links: 2,
            savedAt: '2026-08-11T10:00:00.000Z'
        })
    })

    it('нули для отсутствующей копии', () => {
        expect(backupStats(null)).toEqual({ collections: 0, links: 0, savedAt: '' })
    })
})

describe('serializeBackup / parseBackup', () => {
    it('копия переживает сериализацию', () => {
        const backup = buildBackup(collections, links, '2026-08-11T10:00:00.000Z')
        const parsed = parseBackup(serializeBackup(backup))

        expect(parsed.ok).toBe(true)
        expect(parsed.backup).toEqual(backup)
    })

    it('не-JSON даёт понятную ошибку, а не исключение', () => {
        const parsed = parseBackup('это не json')

        expect(parsed.ok).toBe(false)
        expect(parsed.backup).toBeNull()
        expect(parsed.error).toMatch(/повреждён/)
    })

    it('пустой ввод отвергается', () => {
        expect(parseBackup('').ok).toBe(false)
        expect(parseBackup(null).ok).toBe(false)
        expect(parseBackup(undefined).ok).toBe(false)
    })

    it('чужой JSON отвергается', () => {
        const parsed = parseBackup(JSON.stringify({ songs: [1, 2, 3] }))

        expect(parsed.ok).toBe(false)
        expect(parsed.error).toMatch(/не резервная копия/)
    })

    it('копия из будущей версии отвергается', () => {
        const parsed = parseBackup(JSON.stringify({ v: BACKUP_VERSION + 1, collections, links }))

        expect(parsed.ok).toBe(false)
        expect(parsed.error).toMatch(/более новой версией/)
    })

    it('копия без подборок отвергается', () => {
        const parsed = parseBackup(JSON.stringify({ v: BACKUP_VERSION, collections: [], links: [] }))

        expect(parsed.ok).toBe(false)
        expect(parsed.error).toMatch(/нет подборок/)
    })

    it('копия без блока связей читается', () => {
        const parsed = parseBackup(JSON.stringify({ v: BACKUP_VERSION, collections }))

        expect(parsed.ok).toBe(true)
        expect(parsed.backup.links).toEqual([])
    })

    it('мусор внутри валидной копии вычищается', () => {
        const parsed = parseBackup(
            JSON.stringify({
                v: BACKUP_VERSION,
                savedAt: '2026-08-11T10:00:00.000Z',
                collections: [...collections, { id: 5 }],
                links: [...links, { collectionId: 'x', songNumber: 'y' }]
            })
        )

        expect(parsed.ok).toBe(true)
        expect(parsed.backup.collections).toHaveLength(2)
        expect(parsed.backup.links).toHaveLength(2)
    })
})

describe('planImport', () => {
    const backup = buildBackup(collections, links, '2026-08-11T10:00:00.000Z')

    it('в пустую базу всё создаётся заново', () => {
        const plan = planImport(backup, [])

        expect(plan).toHaveLength(2)
        expect(plan[0]).toMatchObject({ name: 'Избранное', isFavorite: true, action: 'create', targetId: null })
        expect(plan[1]).toMatchObject({ name: 'Пасха', isFavorite: false, action: 'create', targetId: null })
        expect(plan[1].links).toEqual([{ songNumber: 220, variantIndex: 1 }])
    })

    it('«Избранное» ищется по флагу, а не по имени', () => {
        // На другом устройстве системную подборку могли переименовать
        const plan = planImport(backup, [{ id: 7, name: 'Любимые', isFavorite: 1 }])

        expect(plan[0]).toMatchObject({ action: 'merge', targetId: 7 })
    })

    it('обычные подборки сопоставляются по имени без учёта регистра и пробелов', () => {
        const plan = planImport(backup, [{ id: 9, name: '  пасха ' }])

        expect(plan[1]).toMatchObject({ action: 'merge', targetId: 9 })
    })

    it('обычная подборка не сливается с «Избранным» при совпадении имени', () => {
        const plan = planImport(backup, [{ id: 3, name: 'Пасха', isFavorite: 1 }])

        // Имя совпало, но существующая запись — системная: пользовательская
        // «Пасха» из копии должна создаться отдельно
        expect(plan[0]).toMatchObject({ isFavorite: true, action: 'merge', targetId: 3 })
        expect(plan[1]).toMatchObject({ isFavorite: false, action: 'create', targetId: null })
    })

    it('связи группируются по своей подборке', () => {
        const many = buildBackup(collections, [
            ...links,
            { collectionId: 1, songNumber: 116, variantIndex: 0 },
            { collectionId: 1, songNumber: 117, variantIndex: 2 }
        ], '2026-08-11T10:00:00.000Z')

        const plan = planImport(many, [])

        expect(plan[0].links).toHaveLength(3)
        expect(plan[1].links).toHaveLength(1)
    })

    it('подборка без связей даёт пустой список песен', () => {
        const plan = planImport(buildBackup(collections, [], '2026-08-11T10:00:00.000Z'), [])

        expect(plan[0].links).toEqual([])
        expect(plan[1].links).toEqual([])
    })

    it('пустая копия даёт пустой план', () => {
        expect(planImport(null, [])).toEqual([])
        expect(planImport({ collections: [] }, [{ id: 1, name: 'Избранное', isFavorite: 1 }])).toEqual([])
    })
})

describe('backupFileName', () => {
    it('берёт дату из ISO-строки', () => {
        expect(backupFileName('2026-08-11T10:00:00.000Z')).toBe('podborki-2026-08-11.json')
    })

    it('без даты отдаёт запасное имя', () => {
        expect(backupFileName('')).toBe('podborki-backup.json')
        expect(backupFileName(null)).toBe('podborki-backup.json')
    })
})

/** Хранилище-заглушка: поведение localStorage без браузера. */
const fakeStorage = (initial = {}) => {
    const data = { ...initial }
    return {
        data,
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => { data[key] = String(value) },
        removeItem: (key) => { delete data[key] }
    }
}

const meaningful = buildBackup(collections, links, '2026-08-11T10:00:00.000Z')
const trivial = buildBackup([collections[0]], [], '2026-08-12T10:00:00.000Z')

describe('shouldReplaceBackup', () => {
    it('первую копию записывает всегда', () => {
        expect(shouldReplaceBackup(meaningful, null)).toBe(true)
        expect(shouldReplaceBackup(trivial, null)).toBe(true)
    })

    it('пустая копия не записывается', () => {
        expect(shouldReplaceBackup(buildBackup([], [], ''), null)).toBe(false)
    })

    it('содержательная копия не затирается тривиальной', () => {
        // Ровно этот сценарий: базу освободили, «Избранное» пересоздалось —
        // копия с прежними подборками должна уцелеть
        expect(shouldReplaceBackup(trivial, meaningful)).toBe(false)
    })

    it('тривиальную копию можно заменить любой непустой', () => {
        expect(shouldReplaceBackup(meaningful, trivial)).toBe(true)
        expect(shouldReplaceBackup(trivial, trivial)).toBe(true)
    })

    it('содержательную копию можно заменить содержательной', () => {
        const newer = buildBackup(collections, [links[0]], '2026-08-13T10:00:00.000Z')

        expect(shouldReplaceBackup(newer, meaningful)).toBe(true)
    })
})

describe('readBackupFrom / saveBackupTo / clearBackupIn', () => {
    it('записанная копия читается обратно', () => {
        const storage = fakeStorage()

        expect(saveBackupTo(storage, meaningful)).toEqual({ saved: true, reason: '' })
        expect(readBackupFrom(storage)).toEqual({ ok: true, backup: meaningful, error: '' })
    })

    it('без копии чтение возвращает ошибку, а не исключение', () => {
        expect(readBackupFrom(fakeStorage())).toMatchObject({ ok: false, backup: null })
    })

    it('битая копия в хранилище не роняет чтение', () => {
        const storage = fakeStorage({ collectionsBackup: '{сломано' })

        expect(readBackupFrom(storage).ok).toBe(false)
    })

    it('недоступное хранилище не роняет чтение и запись', () => {
        const broken = {
            getItem: () => { throw new Error('приватный режим') },
            setItem: () => { throw new Error('приватный режим') },
            removeItem: () => { throw new Error('приватный режим') }
        }

        expect(readBackupFrom(broken).ok).toBe(false)
        expect(saveBackupTo(broken, meaningful).saved).toBe(false)
        expect(() => clearBackupIn(broken)).not.toThrow()
        expect(readBackupFrom(null).ok).toBe(false)
        expect(saveBackupTo(null, meaningful).saved).toBe(false)
    })

    it('переполнение квоты не бросает наружу', () => {
        const storage = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError') } }

        expect(saveBackupTo(storage, meaningful)).toMatchObject({ saved: false })
    })

    it('тривиальная копия не затирает содержательную', () => {
        const storage = fakeStorage()
        saveBackupTo(storage, meaningful)

        expect(saveBackupTo(storage, trivial).saved).toBe(false)
        expect(readBackupFrom(storage).backup).toEqual(meaningful)
    })

    it('clearBackupIn удаляет копию', () => {
        const storage = fakeStorage()
        saveBackupTo(storage, meaningful)

        clearBackupIn(storage)

        expect(readBackupFrom(storage).ok).toBe(false)
    })
})
