import { createMockDB, closeDB } from './helpers/setup'

// Глобальный mock для IndexedDB
let mockDB = null
const mockDBRef = { current: null }

// Функция для setup IndexedDB в тестах
global.setupTestDB = async () => {
    mockDB = await createMockDB()
    mockDBRef.current = mockDB
    return mockDB
}

// Функция для cleanup IndexedDB
global.cleanupTestDB = () => {
    if (mockDB) {
        closeDB(mockDB)
        mockDB = null
    }
    mockDBRef.current = null
}

afterEach(() => {
    global.cleanupTestDB()
})
