/**
 * Мокирует NuxtApp с заданным экземпляром IndexedDB
 * @param {IDBDatabase} db - Экземпляр базы данных
 * @returns {Object} Mock-объект NuxtApp
 */
export const mockNuxtApp = (db) => {
    return {
        $indexedDB: db
    }
}

/**
 * Создает mock-объект транзакции
 * @param {Object} options - Опции транзакции
 * @param {Object} options.objectStore - Mock objectStore
 * @param {boolean} options.shouldError - Должна ли транзакция завершиться ошибкой
 * @returns {IDBTransaction} Mock-объект транзакции
 */
export const mockTransaction = ({ objectStore, shouldError = false }) => {
    const transaction = {
        objectStore: vi.fn(() => objectStore),
        oncomplete: null,
        onerror: null,
        error: shouldError ? new Error('Transaction error') : null
    }

    // Имитируем завершение транзакции
    setTimeout(() => {
        if (transaction.oncomplete && !shouldError) {
            transaction.oncomplete()
        }
        if (transaction.onerror && shouldError) {
            transaction.onerror({ target: { error: transaction.error } })
        }
    }, 0)

    return transaction
}

/**
 * Создает mock-объект objectStore для простых операций
 * @param {Object} options - Опции хранилища
 * @param {*} options.mockData - Данные для возврата из методов get/getAll/getAllKeys/count
 * @param {string} options.storeName - Название хранилища
 * @param {boolean} options.shouldError - Должен ли store завершиться ошибкой
 * @returns {IDBObjectStore} Mock-объект хранилища
 */
export const mockObjectStore = ({ mockData = null, storeName = 'test', shouldError = false } = {}) => {
    const store = {
        name: storeName,
        clear: vi.fn(() => {
            if (shouldError) {
                throw new Error('Clear error')
            }
        }),
        get: vi.fn((key) => {
            if (shouldError) {
                throw new Error('Get error')
            }
            // Возвращаем данные по ключу или null
            if (Array.isArray(mockData)) {
                return mockData.find(item => item.key === key || item.number === key || item.id === key) || null
            }
            return mockData || null
        }),
        getAll: vi.fn(() => {
            if (shouldError) {
                throw new Error('GetAll error')
            }
            return Array.isArray(mockData) ? mockData : []
        }),
        getAllKeys: vi.fn(() => {
            if (shouldError) {
                throw new Error('GetAllKeys error')
            }
            return Array.isArray(mockData) ? mockData.map(item => item.key || item.number || item.id) : []
        }),
        count: vi.fn(() => {
            if (shouldError) {
                throw new Error('Count error')
            }
            return Array.isArray(mockData) ? mockData.length : 0
        }),
        index: vi.fn((indexName) => ({
            name: indexName,
            get: vi.fn((key) => {
                if (shouldError) {
                    throw new Error('Index get error')
                }
                return null
            }),
            getAll: vi.fn((key) => {
                if (shouldError) {
                    throw new Error('Index getAll error')
                }
                return []
            }),
            count: vi.fn((key) => {
                if (shouldError) {
                    throw new Error('Index count error')
                }
                return 0
            }),
            openCursor: vi.fn((range) => {
                if (shouldError) {
                    throw new Error('Cursor error')
                }
                return {
                    continue: vi.fn(),
                    delete: vi.fn(),
                    primaryKey: null,
                    result: null
                }
            })
        }))
    }

    return store
}

/**
 * Создает mock-объект запроса IndexedDB
 * @param {*} result - Результат запроса
 * @param {boolean} shouldError - Должен ли запрос завершиться ошибкой
 * @returns {Object} Mock-объект запроса
 */
export const mockRequest = (result = null, shouldError = false) => {
    const request = {
        result: result,
        error: shouldError ? new Error('Request error') : null,
        onsuccess: null,
        onerror: null
    }

    // Имитируем завершение запроса
    setTimeout(() => {
        if (request.onsuccess && !shouldError) {
            request.onsuccess()
        }
        if (request.onerror && shouldError) {
            request.onerror({ target: { error: request.error } })
        }
    }, 0)

    return request
}
