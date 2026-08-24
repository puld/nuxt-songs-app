import { describe, it, expect } from 'vitest'
import { checkSectionsIntegrity, MAX_LISTED } from './sections-integrity.js'

// Проверка целостности разделов сборника. Тесты работают с той же формой
// данных, что уходит в songs.json: у песни поле `n`, у раздела — `song_ns`.

/** Песни по номерам. */
const songsOf = (...numbers) => numbers.map((n) => ({ n, title: `Песня ${n}` }))

/** Раздел с номерами песен. */
const section = (id, title, song_ns) => ({ id, title, song_ns })

describe('checkSectionsIntegrity', () => {
    it('на согласованных данных ошибок нет', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1, 2, 3),
            [section(0, 'Первый', [1, 2]), section(1, 'Второй', [3])]
        )

        expect(errors).toEqual([])
    })

    it('порядок номеров внутри раздела не важен', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1, 2, 3),
            [section(0, 'Первый', [3, 1, 2])]
        )

        expect(errors).toEqual([])
    })

    it('находит номер, которому не соответствует песня', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1, 2),
            [section(0, 'Первый', [1, 2, 999])]
        )

        expect(errors).toHaveLength(1)
        expect(errors[0].code).toBe('orphan')
        expect(errors[0].message).toContain('999')
        expect(errors[0].message).toContain('Первый')
    })

    it('находит песню, попавшую в два раздела', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1, 2),
            [section(0, 'Первый', [1, 2]), section(1, 'Второй', [2])]
        )

        expect(errors).toHaveLength(1)
        expect(errors[0].code).toBe('duplicate')
        expect(errors[0].message).toContain('Первый')
        expect(errors[0].message).toContain('Второй')
    })

    it('дубль внутри одного раздела тоже ошибка', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1),
            [section(0, 'Первый', [1, 1])]
        )

        expect(errors.map((e) => e.code)).toEqual(['duplicate'])
    })

    it('находит песню, не попавшую ни в один раздел', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1, 2, 3),
            [section(0, 'Первый', [1, 2])]
        )

        expect(errors).toHaveLength(1)
        expect(errors[0].code).toBe('uncovered')
        expect(errors[0].message).toContain('3')
    })

    it('дубль не отменяет проверку покрытия: вторая песня остаётся непокрытой', () => {
        // Номер 1 занял место в двух разделах, номер 2 не упомянут нигде —
        // обе проблемы должны быть видны сразу, а не по одной за прогон.
        const errors = checkSectionsIntegrity(
            songsOf(1, 2),
            [section(0, 'Первый', [1]), section(1, 'Второй', [1])]
        )

        expect(errors.map((e) => e.code)).toEqual(['duplicate', 'uncovered'])
    })

    it('находит значение, которое вообще не номер', () => {
        const errors = checkSectionsIntegrity(
            songsOf(1),
            [section(0, 'Первый', [1, '12а'])]
        )

        expect(errors.map((e) => e.code)).toEqual(['invalid'])
        expect(errors[0].message).toContain('12а')
    })

    it('номер-строка считается тем же номером', () => {
        // sections.json правят руками, и «12» вместо 12 — не повод объявить
        // песню сиротой: JSON-типизация тут не несёт смысла.
        const errors = checkSectionsIntegrity(songsOf(12), [section(0, 'Первый', ['12'])])

        expect(errors).toEqual([])
    })

    it('пустые разделы означают, что не покрыта ни одна песня', () => {
        const errors = checkSectionsIntegrity(songsOf(1, 2), [])

        expect(errors.map((e) => e.code)).toEqual(['uncovered'])
    })

    it('пустой сборник ошибок не даёт', () => {
        expect(checkSectionsIntegrity([], [])).toEqual([])
    })

    it('отсутствующие аргументы не роняют проверку', () => {
        expect(checkSectionsIntegrity(undefined, undefined)).toEqual([])
    })

    it('длинный список номеров сворачивается счётчиком', () => {
        const total = MAX_LISTED + 5
        const numbers = Array.from({ length: total }, (_, i) => i + 1)

        const errors = checkSectionsIntegrity(songsOf(...numbers), [])

        expect(errors[0].message).toContain(`и ещё ${total - MAX_LISTED}`)
        // Свёрнутые номера в сообщение не попадают.
        expect(errors[0].message).not.toContain(String(total))
    })

    it('раздел без названия обозначается своим id', () => {
        const errors = checkSectionsIntegrity(songsOf(1), [section(7, '', [1, 999])])

        expect(errors[0].message).toContain('#7')
    })
})
