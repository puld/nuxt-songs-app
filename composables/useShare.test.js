import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useShare } from './useShare'

const originalNavigator = globalThis.navigator

const setNavigator = (value) => {
    Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

describe('useShare', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        setNavigator(originalNavigator)
    })

    it('при наличии Web Share открывает системную шторку', async () => {
        const shareSpy = vi.fn().mockResolvedValue(undefined)
        setNavigator({ share: shareSpy, clipboard: { writeText: vi.fn() } })

        const { share } = useShare()
        const result = await share({ title: 'Песня', url: 'https://example.org/song/1' })

        expect(result).toEqual({ ok: true, method: 'share' })
        // Пустого `text` в payload нет — часть целей вставила бы его буквально.
        expect(shareSpy).toHaveBeenCalledWith({
            title: 'Песня',
            url: 'https://example.org/song/1'
        })
    })

    it('закрытая пользователем шторка — не ошибка', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
        const writeText = vi.fn()
        setNavigator({ share: vi.fn().mockRejectedValue(abort), clipboard: { writeText } })

        const { share, shareState } = useShare()
        const result = await share({ url: 'https://example.org/song/1' })

        expect(result).toEqual({ ok: false, cancelled: true })
        // Ни подписи об ошибке, ни тихого копирования за спиной пользователя.
        expect(shareState.value).toBe('')
        expect(writeText).not.toHaveBeenCalled()
    })

    it('сорвавшаяся шторка отступает на буфер обмена', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        setNavigator({ share: vi.fn().mockRejectedValue(new Error('boom')), clipboard: { writeText } })

        const { share, shareState } = useShare()
        const result = await share({ url: 'https://example.org/song/1' })

        expect(result).toEqual({ ok: true, method: 'copy' })
        expect(writeText).toHaveBeenCalledWith('https://example.org/song/1')
        expect(shareState.value).toBe('copied')
    })

    it('без Web Share копирует ссылку в буфер', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        setNavigator({ clipboard: { writeText } })

        const { share, shareState } = useShare()
        const result = await share({ url: 'https://example.org/song/1' })

        expect(result).toEqual({ ok: true, method: 'copy' })
        expect(shareState.value).toBe('copied')
    })

    it('отметка «скопировано» гаснет сама', async () => {
        setNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })

        const { share, shareState } = useShare()
        await share({ url: 'https://example.org/song/1' })
        expect(shareState.value).toBe('copied')

        vi.advanceTimersByTime(3000)
        expect(shareState.value).toBe('')
    })

    it('отказ буфера показывается пользователем читаемой строкой', async () => {
        setNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })

        const { share, shareState } = useShare()
        const result = await share({ url: 'https://example.org/song/1' })

        expect(result.ok).toBe(false)
        expect(shareState.value).toBe('Не удалось скопировать')
    })

    it('без обоих способов сообщает, что копирование недоступно', async () => {
        setNavigator({})

        const { share, canShare } = useShare()
        const result = await share({ url: 'https://example.org/song/1' })

        expect(result).toEqual({ ok: false, error: 'Копирование недоступно' })
        expect(canShare()).toBe(false)
    })

    it('пустой адрес не уходит никуда', async () => {
        const shareSpy = vi.fn()
        setNavigator({ share: shareSpy })

        const { share } = useShare()
        const result = await share({ url: '' })

        expect(result).toEqual({ ok: false, error: 'Нечем поделиться' })
        expect(shareSpy).not.toHaveBeenCalled()
    })
})
