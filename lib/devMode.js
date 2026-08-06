/**
 * Активация режима разработчика семью тапами по версии приложения
 * (как в Android: «Build number» на экране «О телефоне»).
 *
 * Логика вынесена из компонента, чтобы её можно было проверить тестами:
 * подсчёт тапов, окно между тапами и момент активации — это то, что легко
 * сломать правкой в шаблоне.
 *
 * Функции чистые: состояние передаётся аргументом, время — тоже (никаких
 * обращений к Date.now() внутри), возвращается новое состояние.
 */

/** Сколько тапов нужно для активации. */
export const TAPS_REQUIRED = 7

/** Максимальная пауза между тапами, мс. Больше — счётчик начинается заново. */
export const TAP_TIMEOUT_MS = 2000

/** С какого остатка показывать подсказку «осталось N нажатий». */
export const HINT_FROM_REMAINING = 3

/**
 * Начальное состояние счётчика тапов.
 * @returns {{ count: number, lastTapAt: number }}
 */
export const initialTapState = () => ({ count: 0, lastTapAt: 0 })

/**
 * Регистрирует тап по версии приложения.
 *
 * @param {{ count: number, lastTapAt: number }} state - предыдущее состояние
 * @param {number} now - текущее время в мс (Date.now())
 * @returns {{ count: number, lastTapAt: number, activated: boolean, remaining: number }}
 *          `activated` — true ровно на том тапе, который включает режим;
 *          после активации счётчик сбрасывается, чтобы следующая серия
 *          начиналась с нуля.
 */
export const registerTap = (state, now) => {
    const expired = now - state.lastTapAt > TAP_TIMEOUT_MS
    const count = (expired ? 0 : state.count) + 1

    if (count >= TAPS_REQUIRED) {
        return { ...initialTapState(), activated: true, remaining: 0 }
    }

    return {
        count,
        lastTapAt: now,
        activated: false,
        remaining: TAPS_REQUIRED - count
    }
}

/**
 * Нужно ли показывать подсказку об оставшихся нажатиях.
 * Первые тапы молчаливые — иначе режим перестаёт быть скрытым.
 *
 * @param {number} remaining - сколько тапов осталось
 * @returns {boolean}
 */
export const shouldHint = (remaining) => remaining > 0 && remaining <= HINT_FROM_REMAINING
