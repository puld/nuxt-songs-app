import { ref } from 'vue'
import { shareMethod } from '~/lib/share'

/**
 * Отправка ссылки: системная шторка, а если её нет — буфер обмена.
 *
 * Web Share есть на телефонах и в установленном PWA, на desktop его обычно нет.
 * Поэтому две ветки, и обе — про один и тот же результат «ссылка ушла
 * пользователю», просто по-разному.
 *
 * Отказ пользователя (`AbortError`) ошибкой не считается: шторку закрывают
 * пальцем мимо цели куда чаще, чем ошибаются приложения, и красная плашка на
 * это выглядела бы поломкой.
 */
export const useShare = () => {
    /** `''` | `'copied'` | текст ошибки — для подписи под кнопкой. */
    const shareState = ref('')
    let resetTimer = null

    const setState = (value, { autoReset = true } = {}) => {
        shareState.value = value
        if (resetTimer) clearTimeout(resetTimer)
        if (value && autoReset) {
            resetTimer = setTimeout(() => { shareState.value = '' }, 2500)
        }
    }

    /**
     * @param {{ title?: string, text?: string, url: string }} data
     * @returns {Promise<{ok: boolean, method?: 'share'|'copy', cancelled?: boolean, error?: string}>}
     */
    const share = async (data) => {
        const url = String(data?.url ?? '')
        if (!url) return { ok: false, error: 'Нечем поделиться' }

        const nav = typeof navigator === 'undefined' ? null : navigator
        const method = shareMethod(nav)

        if (method === 'share') {
            // Пустые поля не отправляем: часть целей вставляет `text` буквально,
            // и сообщение начиналось бы с пустой строки.
            const payload = { url }
            if (data.title) payload.title = String(data.title)
            if (data.text) payload.text = String(data.text)

            try {
                await nav.share(payload)
                setState('')
                return { ok: true, method: 'share' }
            } catch (error) {
                if (error?.name === 'AbortError') return { ok: false, cancelled: true }
                // Шторка есть, но сорвалась — буфер остаётся рабочим запасом.
                if (nav?.clipboard?.writeText) return copyToClipboard(nav, url)

                setState('Не удалось поделиться')
                return { ok: false, error: 'Не удалось поделиться' }
            }
        }

        if (method === 'copy') return copyToClipboard(nav, url)

        setState('Копирование недоступно')
        return { ok: false, error: 'Копирование недоступно' }
    }

    const copyToClipboard = async (nav, url) => {
        try {
            await nav.clipboard.writeText(url)
            setState('copied')
            return { ok: true, method: 'copy' }
        } catch {
            setState('Не удалось скопировать')
            return { ok: false, error: 'Не удалось скопировать' }
        }
    }

    return { share, shareState, canShare: () => shareMethod(typeof navigator === 'undefined' ? null : navigator) !== 'none' }
}
