import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWakeLockManager } from './wakeLock'

describe('createWakeLockManager', () => {
  let mockWakeLock
  let settingsValue

  beforeEach(() => {
    settingsValue = true

    mockWakeLock = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn()
    }

    // Мокаем navigator.wakeLock
    vi.stubGlobal('navigator', {
      wakeLock: {
        request: vi.fn().mockResolvedValue(mockWakeLock)
      }
    })

    // Мокаем document
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createManager = () => createWakeLockManager(() => settingsValue)

  it('должен запрашивать wake lock при request()', async () => {
    const manager = createManager()
    const result = await manager.request()

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
    expect(result).toBe(true)
  })

  it('должен освобождать wake lock при release()', async () => {
    const manager = createManager()
    await manager.request()
    expect(manager.isActive()).toBe(true)

    await manager.release()
    expect(mockWakeLock.release).toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })

  it('должен запрашивать wake lock при apply(), если настройка включена', async () => {
    settingsValue = true
    const manager = createManager()
    await manager.apply()

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
  })

  it('должен освобождать wake lock при apply(), если настройка выключена', async () => {
    settingsValue = false
    const manager = createManager()
    await manager.apply()

    expect(navigator.wakeLock.request).not.toHaveBeenCalled()
  })

  it('не должен падать, если wakeLock API недоступен', async () => {
    vi.stubGlobal('navigator', {})

    const manager = createManager()
    const result = await manager.request()

    expect(result).toBe(false)
  })

  it('не должен падать при NotAllowedError', async () => {
    navigator.wakeLock.request = vi.fn().mockRejectedValue(
      new DOMException('NotAllowedError', 'NotAllowedError')
    )

    const manager = createManager()
    const result = await manager.request()

    expect(result).toBe(false)
  })

  it('handleVisibilityChange запрашивает lock при возвращении на вкладку', async () => {
    settingsValue = true
    document.visibilityState = 'visible'

    const manager = createManager()
    await manager.handleVisibilityChange()

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
  })

  it('handleVisibilityChange не запрашивает lock, если настройка выключена', async () => {
    settingsValue = false
    document.visibilityState = 'visible'

    const manager = createManager()
    await manager.handleVisibilityChange()

    expect(navigator.wakeLock.request).not.toHaveBeenCalled()
  })

  it('isActive() возвращает false до request()', () => {
    const manager = createManager()
    expect(manager.isActive()).toBe(false)
  })

  it('isActive() возвращает true после request()', async () => {
    const manager = createManager()
    await manager.request()
    expect(manager.isActive()).toBe(true)
  })
})
