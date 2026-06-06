import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldCheck, checkForUpdate } from './autoUpdate'

describe('shouldCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
  })

  it('возвращает true если lastCheckTime = null', () => {
    expect(shouldCheck(null)).toBe(true)
  })

  it('возвращает true если lastCheckTime = 0', () => {
    expect(shouldCheck(0)).toBe(true)
  })

  it('возвращает false если коулдаун не прошёл', () => {
    const now = Date.now()
    expect(shouldCheck(now - 29 * 60 * 1000)).toBe(false) // 29 мин назад
  })

  it('возвращает true если коулдаун прошёл', () => {
    const now = Date.now()
    expect(shouldCheck(now - 30 * 60 * 1000)).toBe(true) // ровно 30 мин
    expect(shouldCheck(now - 31 * 60 * 1000)).toBe(true) // 31 мин
  })

  it('принимает кастомный cooldownMs', () => {
    const now = Date.now()
    expect(shouldCheck(now - 5000, 10000)).toBe(false) // 5 сек < 10 сек
    expect(shouldCheck(now - 10000, 10000)).toBe(true)  // 10 сек >= 10 сек
  })
})

describe('checkForUpdate', () => {
  const url = 'assets/songs.json'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('возвращает changed=false при network ошибке', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await checkForUpdate(url, '"abc123"')
    expect(result.changed).toBe(false)
    expect(result.newEtag).toBe('"abc123"')
  })

  it('возвращает changed=false при не-200 ответе', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null }
    }))

    const result = await checkForUpdate(url, '"abc123"')
    expect(result.changed).toBe(false)
    expect(result.newEtag).toBe('"abc123"')
  })

  it('возвращает changed=false при первом запуске (storedEtag пустой)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name) => name === 'etag' ? '"new-etag"' : null }
    }))

    const result = await checkForUpdate(url, '')
    expect(result.changed).toBe(false)
    expect(result.newEtag).toBe('"new-etag"')
  })

  it('возвращает changed=false если ETag совпадает', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name) => name === 'etag' ? '"same-etag"' : null }
    }))

    const result = await checkForUpdate(url, '"same-etag"')
    expect(result.changed).toBe(false)
    expect(result.newEtag).toBe('"same-etag"')
  })

  it('возвращает changed=true если ETag отличается', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name) => name === 'etag' ? '"new-etag"' : null }
    }))

    const result = await checkForUpdate(url, '"old-etag"')
    expect(result.changed).toBe(true)
    expect(result.newEtag).toBe('"new-etag"')
  })

  it('использует HEAD-запрос', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '"etag1"' }
    })
    vi.stubGlobal('fetch', fetchMock)

    await checkForUpdate(url, '"old"')
    expect(fetchMock).toHaveBeenCalledWith(url, { method: 'HEAD' })
  })

  it('возвращает changed=false если сервер не вернул ETag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null }
    }))

    const result = await checkForUpdate(url, '"old-etag"')
    // ETag пустой — не можем сравнить, считаем что изменений нет
    expect(result.changed).toBe(false)
    expect(result.newEtag).toBe('')
  })
})
