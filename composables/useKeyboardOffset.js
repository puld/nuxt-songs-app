import { computed, ref, watch, onUnmounted } from 'vue'
import { calcPopupOffset } from '~/lib/popupOffset'

/**
 * Держит попап в видимой области, когда открыта экранная клавиатура.
 *
 * Возвращает стиль для оверлея: пока попап помещается по центру — пустой
 * объект, иначе прижимает содержимое к верху видимой области. Расчёт —
 * в `lib/popupOffset.js`, здесь только подписка на `visualViewport`.
 *
 * @param {import('vue').Ref<boolean>} isOpen - открыт ли попап
 * @param {import('vue').Ref<HTMLElement|null>} elRef - корневой элемент попапа
 */
export const useKeyboardOffset = (isOpen, elRef) => {
    const offset = ref(0)

    const overlayStyle = computed(() => (
        offset.value === 0 ? {} : { alignItems: 'flex-start', paddingTop: `${offset.value}px` }
    ))

    const update = () => {
        const viewport = typeof window === 'undefined' ? null : window.visualViewport

        offset.value = isOpen.value && viewport && elRef.value
            ? calcPopupOffset(viewport.height, elRef.value.offsetHeight)
            : 0
    }

    const subscribe = () => {
        const viewport = typeof window === 'undefined' ? null : window.visualViewport
        if (!viewport) return

        viewport.addEventListener('resize', update)
        viewport.addEventListener('scroll', update)
    }

    const unsubscribe = () => {
        const viewport = typeof window === 'undefined' ? null : window.visualViewport
        if (!viewport) return

        viewport.removeEventListener('resize', update)
        viewport.removeEventListener('scroll', update)
    }

    watch(isOpen, (open) => {
        offset.value = 0
        if (open) subscribe()
        else unsubscribe()
    })

    // Уход со страницы с открытым попапом не должен оставлять слушателей
    onUnmounted(unsubscribe)

    return { overlayStyle }
}
