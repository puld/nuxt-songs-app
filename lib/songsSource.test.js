import { describe, it, expect } from 'vitest'
import { songsJsonUrl, SONGS_JSON_PATH, SONGS_FETCH_INIT } from './songsSource'

describe('songsJsonUrl', () => {
    it('в корне сайта даёт путь от корня', () => {
        expect(songsJsonUrl('/')).toBe('/assets/songs.json')
    })

    it('учитывает подкаталог приложения (GitHub Pages)', () => {
        expect(songsJsonUrl('/nuxt-songs-app/')).toBe('/nuxt-songs-app/assets/songs.json')
    })

    it('не зависит от завершающего слэша в baseURL', () => {
        expect(songsJsonUrl('/nuxt-songs-app')).toBe('/nuxt-songs-app/assets/songs.json')
    })

    it('без baseURL считает приложение корневым', () => {
        expect(songsJsonUrl(undefined)).toBe('/assets/songs.json')
        expect(songsJsonUrl('')).toBe('/assets/songs.json')
    })

    it('путь всегда абсолютный: относительный ломался при заходе по прямой ссылке', () => {
        for (const base of ['/', '/nuxt-songs-app/', '', undefined]) {
            expect(songsJsonUrl(base).startsWith('/')).toBe(true)
        }
        expect(SONGS_JSON_PATH).toBe('assets/songs.json')
    })
})

describe('SONGS_FETCH_INIT', () => {
    it('требует ревалидации: ответ из кэша давал «успешное» обновление старым файлом', () => {
        expect(SONGS_FETCH_INIT.cache).toBe('no-cache')
    })
})
