import { describe, it, expect } from 'vitest'
import {
    CHANGELOG,
    CHANGELOG_PREVIEW,
    formatChangelogDate,
    hasMoreChangelog,
    visibleChangelog
} from './changelog.js'
import pkg from '../package.json'

const entry = (version, date) => ({ version, date, changes: ['x'] })

describe('formatChangelogDate', () => {
    it('переставляет ISO-дату в привычный порядок', () => {
        expect(formatChangelogDate('2026-08-24')).toBe('24.08.2026')
    })

    it('ведущие нули сохраняются', () => {
        expect(formatChangelogDate('2026-01-05')).toBe('05.01.2026')
    })

    it('чужой формат и пустое значение — пустая строка', () => {
        // Лучше строка без даты, чем «undefined.NaN.» в интерфейсе.
        expect(formatChangelogDate('24.08.2026')).toBe('')
        expect(formatChangelogDate('2026-8-4')).toBe('')
        expect(formatChangelogDate('')).toBe('')
        expect(formatChangelogDate(null)).toBe('')
        expect(formatChangelogDate(undefined)).toBe('')
    })
})

describe('visibleChangelog', () => {
    const list = [entry('1.3.0', '2026-08-03'), entry('1.2.0', '2026-08-02'), entry('1.1.0', '2026-08-01')]

    it('в свёрнутом виде отдаёт первые limit записей', () => {
        expect(visibleChangelog(list, false, 2)).toEqual(list.slice(0, 2))
    })

    it('в развёрнутом — все', () => {
        expect(visibleChangelog(list, true, 2)).toEqual(list)
    })

    it('записей меньше лимита — отдаёт что есть', () => {
        expect(visibleChangelog(list, false, 10)).toEqual(list)
    })

    it('пустое и некорректное значение — пустой список', () => {
        expect(visibleChangelog([], false)).toEqual([])
        expect(visibleChangelog(undefined, false)).toEqual([])
        expect(visibleChangelog(null, true)).toEqual([])
    })

    it('отрицательный лимит не разворачивает список задом наперёд', () => {
        // `slice(0, -1)` отрезал бы последнюю запись вместо пустого списка.
        expect(visibleChangelog(list, false, -1)).toEqual([])
    })
})

describe('hasMoreChangelog', () => {
    it('true, когда записей больше лимита', () => {
        expect(hasMoreChangelog([entry('1.2.0', '2026-08-02'), entry('1.1.0', '2026-08-01')], 1)).toBe(true)
    })

    it('false, когда прятать нечего', () => {
        expect(hasMoreChangelog([entry('1.1.0', '2026-08-01')], 1)).toBe(false)
        expect(hasMoreChangelog([], 3)).toBe(false)
        expect(hasMoreChangelog(undefined, 3)).toBe(false)
    })
})

describe('данные чейнджлога', () => {
    it('первая запись — текущая версия приложения', () => {
        // Версия живёт в package.json; забытая запись означала бы, что
        // пользователь видит на /about версию, которой в списке нет.
        expect(CHANGELOG[0].version).toBe(pkg.version)
    })

    it('версии не повторяются', () => {
        const versions = CHANGELOG.map((item) => item.version)

        expect(new Set(versions).size).toBe(versions.length)
    })

    it('версии идут от свежей к старой', () => {
        const weight = (version) => {
            const [major, minor, patch] = version.split('.').map(Number)

            return major * 1e6 + minor * 1e3 + patch
        }

        for (let i = 1; i < CHANGELOG.length; i++) {
            expect(weight(CHANGELOG[i - 1].version)).toBeGreaterThan(weight(CHANGELOG[i].version))
        }
    })

    it('даты в ISO-формате и не идут в будущее относительно предыдущей записи', () => {
        for (let i = 0; i < CHANGELOG.length; i++) {
            expect(formatChangelogDate(CHANGELOG[i].date)).not.toBe('')
            if (i > 0) expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
        }
    })

    it('у каждой версии есть хотя бы одно непустое описание', () => {
        for (const item of CHANGELOG) {
            expect(item.changes.length).toBeGreaterThan(0)
            for (const line of item.changes) expect(line.trim()).not.toBe('')
        }
    })

    it('лимит предпросмотра положительный', () => {
        expect(CHANGELOG_PREVIEW).toBeGreaterThan(0)
    })
})
