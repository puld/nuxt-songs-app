import { useNuxtApp } from 'nuxt/app'

/**
 * Composable для работы с IndexedDB хранилищем песен и подборок
 * @returns {Object} Объект с методами для работы с IndexedDB
 */
export const useIndexDB = () => {
    const {$indexedDB} = useNuxtApp();

    /**
     * Преобразует значение в число с валидацией
     * @param {*} value - Преобразуемое значение
     * @returns {number} Числовое значение
     * @throws {TypeError} Если значение не может быть преобразовано в число
     */
    const normalizeNumber = (value) => {
        const num = Number(value);
        if (isNaN(num)) {
            throw new TypeError(`Значение "${value}" не может быть преобразовано в число`);
        }
        return num;
    };

    /**
     * Создает транзакцию для заданных хранилищ
     * @param {string|string[]} storeNames - Название или массив названий хранилищ
     * @param {string} mode - Режим транзакции ('readonly' или 'readwrite')
     * @returns {IDBTransaction} Объект транзакции
     * @throws {Error} Если хранилище не существует или неверный режим
     */
    const createTransaction = (storeNames, mode) => {
        return $indexedDB.transaction(storeNames, mode);
    };

    /**
     * Сохраняет массив песен в IndexedDB, предварительно очищая хранилище
     * @param {Array} songs - Массив песен для сохранения
     * @returns {Promise<void>}
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если массив песен неверного формата
     */
    const addSongs = async (songs) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');

            // Очищаем перед добавлением
            store.clear()

            // Добавляем только нужные данные
            songs.forEach(song => {
                store.put({
                    number: Number(song.n),
                    title: String(song.title),
                    body: song.body.map(item => ({
                        id: Number(item.id),
                        n : Number(item.n),
                        type: String(item.type),
                        content: item.content ? String(item.content) : null,
                        repeatId: item.repeatId ? String(item.repeatId) : null
                    })),
                })
            })

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    };

    /**
     * Получает песню по номеру
     * @param {number|string} number - Номер песни
     * @returns {Promise<Object|null>} Объект песни или null, если не найдена
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если номер не может быть преобразован в число
     */
    const getSong = async (number) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly');
            const store = transaction.objectStore('songs');
            const request = store.get(Number(number));

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    };

    /**
     * Создает новую подборку песен
     * @param {string} name - Название подборки
     * @returns {Promise<number>} ID созданной подборки (autoIncrement)
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если имя не является строкой
     */
    const createCollection = async (name) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readwrite')
            const store = transaction.objectStore('collections')
            const request = store.add({
                name: String(name), // гарантируем, что это строка
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })

            request.onsuccess = () => resolve(request.result)
            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Получает список всех подборок
     * @returns {Promise<Array>} Массив всех подборок
     * @throws {Error} При ошибке транзакции IndexedDB
     */
    const getCollections = async () => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readonly')
            const store = transaction.objectStore('collections')
            const request = store.getAll()

            request.onsuccess = () => resolve(request.result)
            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Добавляет песню в подборку
     * @param {number|string} collectionId - ID подборки
     * @param {number|string} songNumber - Номер песни
     * @returns {Promise<void>}
     * @throws {Error} При ошибке транзакции IndexedDB или если песня уже есть в подборке
     * @throws {TypeError} Если ID или номер не могут быть преобразованы в число
     */
    const addSongToCollection = async (collectionId, songNumber) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readwrite')
            const store = transaction.objectStore('songCollections')

            // Проверяем, не добавлена ли уже эта песня
            const index = store.index('collectionId_songNumber')
            const checkRequest = index.get([collectionId, songNumber])

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    reject(new Error('Песня уже есть в этой подборке'))
                    return
                }

                const addRequest = store.add({
                    collectionId: Number(collectionId), // убедимся, что это число
                    songNumber: Number(songNumber),     // убедимся, что это число
                    addedAt: new Date().toISOString()   // строка
                })

                addRequest.onsuccess = () => resolve()
                addRequest.onerror = (event) => reject(event.target.error)
            }

            checkRequest.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Получает все песни из указанной подборки
     * @param {number|string} collectionId - ID подборки
     * @returns {Promise<Array>} Массив песен в подборке, отсортированных по номеру
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если ID не может быть преобразован в число
     */
    const getSongsInCollection = async (collectionId) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections', 'songs'], 'readonly')
            const songCollectionsStore = transaction.objectStore('songCollections')
            const songsStore = transaction.objectStore('songs')

            // Получаем все связи для данной подборки
            const index = songCollectionsStore.index('collectionId')
            const request = index.getAll(Number(collectionId))

            request.onsuccess = async () => {
                const songLinks = request.result
                if (!songLinks.length) {
                    resolve([])
                    return
                }

                // Получаем полные данные песен
                const songs = await Promise.all(
                    songLinks.map(link => {
                        return new Promise((resolve) => {
                            const songRequest = songsStore.get(Number(link.songNumber))
                            songRequest.onsuccess = () => resolve(songRequest.result)
                            songRequest.onerror = () => resolve(null)
                        })
                    })
                )

                resolve(songs.filter(Boolean).sort((a, b) => a.number - b.number))
            }

            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Получает список подборок, содержащих указанную песню
     * @param {number|string} songNumber - Номер песни
     * @returns {Promise<Array>} Массив подборок, содержащих песню
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если номер не может быть преобразован в число
     */
    const getCollectionsForSong = async (songNumber) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections', 'collections'], 'readonly')
            const songCollectionsStore = transaction.objectStore('songCollections')
            const collectionsStore = transaction.objectStore('collections')

            const index = songCollectionsStore.index('songNumber')
            const request = index.getAll(songNumber)

            request.onsuccess = async () => {
                const collectionIds = request.result.map(item => item.collectionId)
                const collections = await Promise.all(
                    collectionIds.map(id => {
                        return new Promise((resolve) => {
                            const collectionRequest = collectionsStore.get(id)
                            collectionRequest.onsuccess = () => resolve(collectionRequest.result)
                            collectionRequest.onerror = () => resolve(null)
                        })
                    })
                )
                resolve(collections.filter(Boolean))
            }

            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Получает список подборок, в которые можно добавить песню (исключает уже добавленные)
     * @param {number|string} songNumber - Номер песни
     * @returns {Promise<Array>} Массив доступных для добавления подборок
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если номер не может быть преобразован в число
     */
    const getAvailableCollections = async (songNumber) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections', 'songCollections'], 'readonly')
            const collectionsStore = transaction.objectStore('collections')
            const songCollectionsStore = transaction.objectStore('songCollections')

            // 1. Получаем все подборки
            const getAllCollections = collectionsStore.getAll()

            // 2. Получаем подборки, куда уже добавлена эта песня
            const songCollectionsIndex = songCollectionsStore.index('songNumber')
            const getExistingLinks = songCollectionsIndex.getAll(Number(songNumber))

            getAllCollections.onsuccess = () => {
                const allCollections = getAllCollections.result

                getExistingLinks.onsuccess = () => {
                    const existingLinks = getExistingLinks.result
                    const existingCollectionIds = existingLinks.map(link => link.collectionId)

                    // Фильтруем подборки, исключая те, куда уже добавлена песня
                    const availableCollections = allCollections.filter(
                        collection => !existingCollectionIds.includes(collection.id)
                    )

                    resolve(availableCollections)
                }
            }

            transaction.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Удаляет подборку и все связи с песнями
     * @param {number|string} id - ID подборки для удаления
     * @returns {Promise<void>}
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если ID не может быть преобразован в число
     */
    const deleteCollection = async (id) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(
                ['collections', 'songCollections'],
                'readwrite'
            )

            // 1. Удаляем все связи с песнями
            const songCollectionsStore = transaction.objectStore('songCollections')
            const index = songCollectionsStore.index('collectionId')
            const request = index.openCursor(IDBKeyRange.only(id))

            request.onsuccess = (e) => {
                const cursor = e.target.result
                if (cursor) {
                    songCollectionsStore.delete(cursor.primaryKey)
                    cursor.continue()
                }
            }

            // 2. Удаляем саму подборку
            const collectionsStore = transaction.objectStore('collections')
            collectionsStore.delete(id)

            transaction.oncomplete = () => resolve()
            transaction.onerror = (e) => reject(e.target.error)
        })
    }

    /**
     * Получает подборку по ID
     * @param {number|string} id - ID подборки
     * @returns {Promise<Object|null>} Объект подборки или null, если не найдена
     * @throws {Error} При ошибке транзакции IndexedDB
     * @throws {TypeError} Если ID не может быть преобразован в число
     */
    const getCollection = async (id) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readonly')
            const store = transaction.objectStore('collections')
            const request = store.get(Number(id))

            request.onsuccess = () => resolve(request.result || null)
            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Удаляет песню из подборки
     * @param {number|string} collectionId - ID подборки
     * @param {number|string} songNumber - Номер песни
     * @returns {Promise<void>}
     * @throws {Error} При ошибке транзакции IndexedDB или если связь не найдена
     * @throws {TypeError} Если ID или номер не могут быть преобразованы в число
     */
    const removeSongFromCollection = async (collectionId, songNumber) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readwrite')
            const store = transaction.objectStore('songCollections')
            const index = store.index('collectionId_songNumber')

            // Находим и удаляем связь
            const request = index.get([Number(collectionId), Number(songNumber)])

            request.onsuccess = () => {
                if (!request.result) {
                    reject(new Error('Связь не найдена'))
                    return
                }

                const deleteRequest = store.delete(request.result.id)
                deleteRequest.onsuccess = () => resolve()
                deleteRequest.onerror = (event) => reject(event.target.error)
            }

            request.onerror = (event) => reject(event.target.error)
        })
    }

    /**
     * Получает количество песен в базе данных
     * @returns {Promise<number>} Количество песен
     * @throws {Error} При ошибке транзакции IndexedDB (возвращает 0 при ошибке)
     */
    const getSongsCount = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.count()

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve(0) // Возвращаем 0 при ошибке
        })
    }

    /**
     * Получает список номеров всех песен в базе данных
     * @returns {Promise<Array<number>>} Массив номеров всех песен
     * @throws {Error} При ошибке транзакции IndexedDB (возвращает пустой массив при ошибке)
     */
    const getSongNumbers = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAllKeys()

            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => resolve([])
        })
    }

    /**
     * Подсчитывает количество песен в подборке
     * @param {number|string} collectionId - ID подборки
     * @returns {Promise<number>} Количество песен в подборке
     * @throws {Error} При ошибке транзакции IndexedDB (возвращает 0 при ошибке)
     * @throws {TypeError} Если ID не может быть преобразован в число
     */
    const getSongsCountInCollection = async (collectionId) => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readonly')
            const store = transaction.objectStore('songCollections')
            const index = store.index('collectionId')
            const request = index.count(Number(collectionId))

            request.onsuccess = () => resolve(request.result || 0)
            request.onerror = () => resolve(0)
        })
    }

    /**
     * Получает все песни из базы данных
     * @returns {Promise<Array>} Массив всех песен
     * @throws {Error} При ошибке транзакции IndexedDB (возвращает пустой массив при ошибке)
     */
    const getAllSongs = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAll()

            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => resolve([])
        })
    }

    return {
        addSongs,
        getSong,
        createCollection,
        getCollections,
        addSongToCollection,
        removeSongFromCollection,
        getSongsInCollection,
        getCollectionsForSong,
        getCollection,
        getAvailableCollections,
        deleteCollection,
        getSongsCount,
        getSongNumbers,
        getSongsCountInCollection,
        getAllSongs
    };
};