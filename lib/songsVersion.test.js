import { describe, it, expect } from 'vitest'
import { normalizeSongsVersion, DEFAULT_SONGS_VERSION } from './songsVersion'

describe('normalizeSongsVersion', () => {
    it('пропускает целое неотрицательное', () => {
        expect(normalizeSongsVersion(0)).toBe(0)
        expect(normalizeSongsVersion(12)).toBe(12)
    })

    it('читает число из строки — значение приходит и из localStorage', () => {
        expect(normalizeSongsVersion('12')).toBe(12)
    })

    it('отсутствующее поле — версия по умолчанию', () => {
        // songs.json мог приехать из кэша PWA от сборки без версии.
        expect(normalizeSongsVersion(undefined)).toBe(DEFAULT_SONGS_VERSION)
        expect(normalizeSongsVersion(null)).toBe(DEFAULT_SONGS_VERSION)
    })

    it('мусор и нечисловые значения — версия по умолчанию', () => {
        // «Версия неизвестна» = самая старая: сравнение ошибётся в безопасную
        // сторону и предложит обновить базу.
        expect(normalizeSongsVersion('три')).toBe(DEFAULT_SONGS_VERSION)
        expect(normalizeSongsVersion(NaN)).toBe(DEFAULT_SONGS_VERSION)
        expect(normalizeSongsVersion({})).toBe(DEFAULT_SONGS_VERSION)
        expect(normalizeSongsVersion([])).toBe(DEFAULT_SONGS_VERSION)
    })

    it('дробное и отрицательное — версия по умолчанию', () => {
        expect(normalizeSongsVersion(1.5)).toBe(DEFAULT_SONGS_VERSION)
        expect(normalizeSongsVersion(-3)).toBe(DEFAULT_SONGS_VERSION)
    })
})
