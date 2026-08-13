import { describe, it, expect } from 'vitest'
import {
    formatPersisted,
    formatEstimate,
    formatIsoDate,
    formatBackup,
    buildDiagnostics
} from './diagnostics'

describe('formatPersisted', () => {
    it('сообщает об отсутствии поддержки', () => {
        expect(formatPersisted({ supported: false, persisted: false })).toBe('браузер не поддерживает')
    })

    it('без данных считает, что поддержки нет', () => {
        expect(formatPersisted(null)).toBe('браузер не поддерживает')
    })

    it('различает выданный и невыданный флаг', () => {
        expect(formatPersisted({ supported: true, persisted: true })).toBe('да')
        expect(formatPersisted({ supported: true, persisted: false })).toBe('нет')
    })

    it('не выдаёт «нет» за непроверенное состояние', () => {
        expect(formatPersisted({ supported: true, persisted: null })).toBe('не проверялось')
    })
})

describe('formatEstimate', () => {
    it('показывает занятое место и квоту', () => {
        expect(formatEstimate({ usage: 2 * 1024 * 1024, quota: 1024 * 1024 * 1024 }))
            .toBe('2.0 МБ из 1.0 ГБ')
    })

    it('без оценки ставит прочерк', () => {
        expect(formatEstimate(null)).toBe('—')
    })
})

describe('formatIsoDate', () => {
    it('переводит ISO в ДД.ММ.ГГГГ', () => {
        expect(formatIsoDate('2026-08-11T10:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.2026$/)
    })

    it('дополняет день и месяц нулями', () => {
        expect(formatIsoDate('2026-01-05T12:00:00.000Z')).toBe('05.01.2026')
    })

    it('на мусоре и пустом значении возвращает пустую строку', () => {
        expect(formatIsoDate('не дата')).toBe('')
        expect(formatIsoDate('')).toBe('')
        expect(formatIsoDate(null)).toBe('')
    })
})

describe('formatBackup', () => {
    it('без копии сообщает «нет»', () => {
        expect(formatBackup(null)).toBe('нет')
        expect(formatBackup({ collections: 0, links: 0, savedAt: null })).toBe('нет')
    })

    it('показывает дату и счётчики', () => {
        expect(formatBackup({ collections: 3, links: 12, savedAt: '2026-08-11T10:00:00.000Z' }))
            .toBe('от 11.08.2026, подборок / песен: 3 / 12')
    })

    it('без даты остаются счётчики', () => {
        expect(formatBackup({ collections: 2, links: 5, savedAt: null }))
            .toBe('подборок / песен: 2 / 5')
    })
})

describe('buildDiagnostics', () => {
    const valueOf = (rows, label) => rows.find((row) => row.label === label)?.value

    it('собирает строки из переданных значений', () => {
        const rows = buildDiagnostics({
            songs: 1565,
            collections: 3,
            links: 12,
            dbVersion: 6,
            persisted: { supported: true, persisted: true },
            estimate: { usage: 1024, quota: 2048 },
            backup: { collections: 3, links: 12, savedAt: '2026-08-11T10:00:00.000Z' }
        })

        expect(valueOf(rows, 'Песен в базе')).toBe('1565')
        expect(valueOf(rows, 'Подборок')).toBe('3')
        expect(valueOf(rows, 'Песен в подборках')).toBe('12')
        expect(valueOf(rows, 'Постоянное хранилище')).toBe('да')
        expect(valueOf(rows, 'Версия базы')).toBe('6')
    })

    it('работает без аргументов — на неоткрытой базе', () => {
        const rows = buildDiagnostics()

        expect(valueOf(rows, 'Песен в базе')).toBe('0')
        expect(valueOf(rows, 'Версия базы')).toBe('база недоступна')
        expect(valueOf(rows, 'Занято места')).toBe('—')
        expect(valueOf(rows, 'Резервная копия')).toBe('нет')
    })

    it('технические строки помечены dev, пользовательские — нет', () => {
        const rows = buildDiagnostics()
        const dev = rows.filter((row) => row.dev).map((row) => row.label)

        expect(dev).toEqual(['Версия базы', 'Занято места'])
        expect(rows.filter((row) => !row.dev).length).toBeGreaterThan(0)
    })

    it('нулевые счётчики выводятся как «0», а не теряются', () => {
        const rows = buildDiagnostics({ songs: 0, collections: 0, links: 0 })

        expect(valueOf(rows, 'Песен в базе')).toBe('0')
        expect(valueOf(rows, 'Подборок')).toBe('0')
    })
})
