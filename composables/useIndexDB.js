import { useNuxtApp } from 'nuxt/app'

export const useIndexDB = () => {
    const {$indexedDB} = useNuxtApp();

    const addSongs = async (songs) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            store.clear()
            songs.forEach(song => {
                const variants = song.variants || [{ label: '', body: song.body || [] }];
                store.put({
                    number: Number(song.n),
                    title: String(song.title),
                    variants: variants.map(variant => ({
                        label: String(variant.label || ''),
                        body: (variant.body || []).map(item => ({
                            id: Number(item.id),
                            n: Number(item.n),
                            type: String(item.type),
                            content: item.content ? String(item.content) : null,
                            repeatId: item.repeatId ? String(item.repeatId) : null
                        })),
                    })),
                })
            })
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    };

    const getSong = async (number) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly');
            const store = transaction.objectStore('songs');
            const request = store.get(Number(number));
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    };

    const createCollection = async (name) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readwrite')
            const store = transaction.objectStore('collections')
            const request = store.add({
                name: String(name),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            request.onsuccess = () => resolve(request.result)
            request.onerror = (event) => reject(event.target.error)
        })
    }

    const getCollections = async () => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readonly')
            const store = transaction.objectStore('collections')
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = (event) => reject(event.target.error)
        })
    }

    const addSongToCollection = async (collectionId, songNumber, variantIndex = 0) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readwrite')
            const store = transaction.objectStore('songCollections')
            const index = store.index('collectionId_songNumber_variantIndex')
            const checkRequest = index.get([Number(collectionId), Number(songNumber), Number(variantIndex)])

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    reject(new Error('Этот вариант песни уже есть в подборке'))
                    return
                }
                const addRequest = store.add({
                    collectionId: Number(collectionId),
                    songNumber: Number(songNumber),
                    variantIndex: Number(variantIndex),
                    addedAt: new Date().toISOString()
                })
                addRequest.onsuccess = () => resolve()
                addRequest.onerror = (event) => reject(event.target.error)
            }
            checkRequest.onerror = (event) => reject(event.target.error)
        })
    }

    const getSongsInCollection = async (collectionId) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections', 'songs'], 'readonly')
            const songCollectionsStore = transaction.objectStore('songCollections')
            const songsStore = transaction.objectStore('songs')

            const index = songCollectionsStore.index('collectionId')
            const request = index.getAll(Number(collectionId))

            request.onsuccess = async () => {
                const songLinks = request.result
                if (!songLinks.length) {
                    resolve([])
                    return
                }
                const songs = await Promise.all(
                    songLinks.map(link => {
                        return new Promise((resolve) => {
                            const songRequest = songsStore.get(Number(link.songNumber))
                            songRequest.onsuccess = () => {
                                const song = songRequest.result
                                if (song) {
                                    song.variantIndex = link.variantIndex ?? 0
                                }
                                resolve(song)
                            }
                            songRequest.onerror = () => resolve(null)
                        })
                    })
                )
                resolve(songs.filter(Boolean).sort((a, b) => a.number - b.number))
            }
            request.onerror = (event) => reject(event.target.error)
        })
    }

    const getCollectionsForSong = async (songNumber) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections', 'collections'], 'readonly')
            const songCollectionsStore = transaction.objectStore('songCollections')
            const collectionsStore = transaction.objectStore('collections')

            const index = songCollectionsStore.index('songNumber')
            const request = index.getAll(songNumber)

            request.onsuccess = async () => {
                const links = request.result
                const collections = await Promise.all(
                    links.map(link => {
                        return new Promise((resolve) => {
                            const collectionRequest = collectionsStore.get(link.collectionId)
                            collectionRequest.onsuccess = () => {
                                const collection = collectionRequest.result
                                if (collection) {
                                    collection.variantIndex = link.variantIndex ?? 0
                                }
                                resolve(collection)
                            }
                            collectionRequest.onerror = () => resolve(null)
                        })
                    })
                )
                resolve(collections.filter(Boolean))
            }
            request.onerror = (event) => reject(event.target.error)
        })
    }

    const getAvailableCollections = async (songNumber, variantIndex = 0) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections', 'songCollections'], 'readonly')
            const collectionsStore = transaction.objectStore('collections')
            const songCollectionsStore = transaction.objectStore('songCollections')

            const getAllCollections = collectionsStore.getAll()
            const songCollectionsIndex = songCollectionsStore.index('songNumber')
            const getExistingLinks = songCollectionsIndex.getAll(Number(songNumber))

            getAllCollections.onsuccess = () => {
                const allCollections = getAllCollections.result
                getExistingLinks.onsuccess = () => {
                    const existingLinks = getExistingLinks.result
                    const existingCollectionIds = existingLinks
                        .filter(link => (link.variantIndex ?? 0) === Number(variantIndex))
                        .map(link => link.collectionId)
                    const availableCollections = allCollections.filter(
                        collection => !existingCollectionIds.includes(collection.id)
                    )
                    resolve(availableCollections)
                }
            }
            transaction.onerror = (event) => reject(event.target.error)
        })
    }

    const deleteCollection = async (id) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections', 'songCollections'], 'readwrite')
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
            const collectionsStore = transaction.objectStore('collections')
            collectionsStore.delete(id)
            transaction.oncomplete = () => resolve()
            transaction.onerror = (e) => reject(e.target.error)
        })
    }

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
     * Обновляет название подборки
     * @param {number|string} id - ID подборки
     * @param {string} name - Новое название
     * @returns {Promise<void>}
     */
    const updateCollection = async (id, name) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readwrite')
            const store = transaction.objectStore('collections')
            const request = store.get(Number(id))

            request.onsuccess = () => {
                if (!request.result) {
                    reject(new Error('Подборка не найдена'))
                    return
                }
                const updated = { ...request.result, name: String(name), updatedAt: new Date().toISOString() }
                const putRequest = store.put(updated)
                putRequest.onsuccess = () => resolve()
                putRequest.onerror = (event) => reject(event.target.error)
            }
            request.onerror = (event) => reject(event.target.error)
        })
    }

    const removeSongFromCollection = async (collectionId, songNumber, variantIndex = 0) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readwrite')
            const store = transaction.objectStore('songCollections')
            const index = store.index('collectionId_songNumber_variantIndex')
            const request = index.get([Number(collectionId), Number(songNumber), Number(variantIndex)])

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

    const getSongsCount = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.count()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve(0)
        })
    }

    const getSongNumbers = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songs'], 'readonly')
            const store = transaction.objectStore('songs')
            const request = store.getAllKeys()
            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => resolve([])
        })
    }

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
        addSongs, getSong, createCollection, getCollections,
        addSongToCollection, removeSongFromCollection,
        getSongsInCollection, getCollectionsForSong,
        getCollection, getAvailableCollections, deleteCollection, updateCollection,
        getSongsCount, getSongNumbers, getSongsCountInCollection, getAllSongs
    };
};
