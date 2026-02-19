let originalFetch = null

/**
 * Сохраняет оригинальную функцию fetch перед тестами
 */
export const saveOriginalFetch = () => {
    originalFetch = global.fetch
}

/**
 * Восстанавливает оригинальную функцию fetch после тестов
 */
export const restoreOriginalFetch = () => {
    if (originalFetch) {
        global.fetch = originalFetch
        originalFetch = null
    }
}

/**
 * Мокирует глобальный fetch с заданным ответом
 * @param {*} data - Данные для возврата
 * @param {Object} options - Опции ответа
 * @param {number} options.status - HTTP статус ответа (по умолчанию 200)
 * @param {string} options.contentType - Content-Type ответа (по умолчанию 'application/json')
 * @param {boolean} options.shouldFail - Должен ли fetch завершиться ошибкой
 * @returns {Function} Функция для восстановления оригинального fetch
 */
export const mockFetchResponse = (data, { status = 200, contentType = 'application/json', shouldFail = false } = {}) => {
    saveOriginalFetch()

    global.fetch = vi.fn(async () => {
        if (shouldFail) {
            throw new Error('Fetch failed')
        }

        return {
            ok: status >= 200 && status < 300,
            status,
            headers: new Map([
                ['content-type', contentType]
            ]),
            json: async () => {
                if (contentType.includes('application/json')) {
                    return data
                }
                throw new TypeError('Получен не JSON-ответ')
            },
            text: async () => {
                if (typeof data === 'string') {
                    return data
                }
                return JSON.stringify(data)
            }
        }
    })

    return restoreOriginalFetch
}

/**
 * Мокирует fetch с ошибкой HTTP
 * @param {number} status - HTTP статус ошибки
 * @returns {Function} Функция для восстановления оригинального fetch
 */
export const mockFetchError = (status = 404) => {
    return mockFetchResponse(null, {
        status,
        ok: false
    })
}

/**
 * Мокирует fetch с неправильным Content-Type
 * @param {string} contentType - Неверный Content-Type
 * @returns {Function} Функция для восстановления оригинального fetch
 */
export const mockFetchWrongContentType = (contentType = 'text/plain') => {
    return mockFetchResponse(
        { songs: [] },
        {
            status: 200,
            contentType
        }
    )
}

/**
 * Сбрасывает все mock-и fetch
 */
export const clearFetchMocks = () => {
    if (originalFetch) {
        global.fetch = originalFetch
        originalFetch = null
    }
    vi.restoreAllMocks()
}
