import { useNuxtApp } from 'nuxt/app'
import { buildBackup, saveBackupTo } from '~/lib/collectionsBackup'
import { nextOrder, orderPlan } from '~/lib/collectionsOrder'

export const useIndexDB = () => {
    const {$indexedDB} = useNuxtApp();

    /**
     * База может быть недоступна: плагин провайдит `null`, если открыть её не
     * удалось (см. `plugins/indexedDB.client.js`). Раньше такого состояния не
     * существовало — плагин просто падал вместе со всем приложением.
     *
     * Чтения в этом случае отдают пустой результат: экраны показывают «пусто»
     * вместо белого экрана, а причина видна в диагностике на `/about`.
     */
    const guardRead = (fn, fallback) => (...args) =>
        $indexedDB ? fn(...args) : Promise.resolve(fallback)

    /** Записи молча не проглатываем: пользователь должен увидеть отказ. */
    const guardWrite = (fn) => (...args) =>
        $indexedDB ? fn(...args) : Promise.reject(new Error('База данных недоступна'))

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

    /**
     * Новая подборка встаёт в конец списка: `order` берётся следом за последним
     * существующим. Читаем текущие подборки в той же транзакции — иначе две
     * подборки, созданные подряд, могли бы получить один и тот же порядок.
     */
    const createCollection = async (name) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readwrite')
            const store = transaction.objectStore('collections')
            const existing = store.getAll()

            existing.onsuccess = () => {
                const now = new Date().toISOString()
                const request = store.add({
                    name: String(name),
                    order: nextOrder(existing.result || []),
                    createdAt: now,
                    updatedAt: now,
                })
                request.onsuccess = () => resolve(request.result)
                request.onerror = (event) => reject(event.target.error)
            }
            existing.onerror = (event) => reject(event.target.error)
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

    /**
     * Записывает новый порядок подборок: `order` = позиция в переданном списке.
     *
     * Пишутся только записи, у которых порядок реально изменился
     * (`orderPlan`) — перестановка одной подборки не переписывает всё
     * хранилище. Идентификаторы, которых в базе нет, пропускаются: список
     * приходит из открытого сайдбара, а подборку могли удалить в другой вкладке.
     *
     * Порядок не входит в резервную копию (там имена и связи), поэтому
     * `withBackup` тут не нужен: копия от перестановки не устаревает.
     *
     * @param {Array<number>} orderedIds — id подборок в нужном порядке
     * @returns {Promise<number>} сколько записей обновлено
     */
    const reorderCollections = async (orderedIds) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['collections'], 'readwrite')
            const store = transaction.objectStore('collections')
            const request = store.getAll()

            request.onsuccess = () => {
                const byId = new Map((request.result || []).map((item) => [Number(item.id), item]))
                const ordered = (Array.isArray(orderedIds) ? orderedIds : [])
                    .map((id) => byId.get(Number(id)))
                    .filter(Boolean)
                const plan = orderPlan(ordered)

                if (!plan.length) {
                    resolve(0)
                    return
                }

                const now = new Date().toISOString()
                let written = 0

                for (const { id, order } of plan) {
                    store.put({ ...byId.get(Number(id)), order, updatedAt: now })
                    written++
                }

                transaction.oncomplete = () => resolve(written)
                transaction.onerror = (event) => reject(event.target.error)
            }
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

                    // Добавляем songsCount для каждой подборки
                    const results = []
                    let pending = availableCollections.length
                    if (pending === 0) { resolve(results); return }

                    availableCollections.forEach(collection => {
                        const countIndex = songCollectionsStore.index('collectionId')
                        const countReq = countIndex.count(collection.id)
                        countReq.onsuccess = () => {
                            results.push({ ...collection, songsCount: countReq.result || 0 })
                            if (--pending === 0) resolve(results)
                        }
                        countReq.onerror = () => {
                            results.push({ ...collection, songsCount: 0 })
                            if (--pending === 0) resolve(results)
                        }
                    })
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

    /**
     * Перезаписывает разделы сборника. Как и песни, разделы приходят целиком
     * из `songs.json`, поэтому старые записи чистим: раздел мог исчезнуть.
     */
    const addSections = async (sections) => {
        return new Promise((resolve, reject) => {
            const transaction = $indexedDB.transaction(['sections'], 'readwrite')
            const store = transaction.objectStore('sections')
            store.clear()
            sections.forEach((section) => {
                store.put({
                    id: Number(section.id),
                    title: String(section.title),
                    songNumbers: (section.song_ns || section.songNumbers || []).map(Number)
                })
            })
            transaction.oncomplete = () => resolve()
            transaction.onerror = (event) => reject(event.target.error)
        })
    }

    /** Разделы сборника по порядку `id`. */
    const getSections = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['sections'], 'readonly')
            const store = transaction.objectStore('sections')
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => resolve([])
        })
    }

    /** Сколько разделов в базе; 0 при любой ошибке. */
    const getSectionsCount = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['sections'], 'readonly')
            const store = transaction.objectStore('sections')
            const request = store.count()
            request.onsuccess = () => resolve(request.result || 0)
            request.onerror = () => resolve(0)
        })
    }

    const getFavoriteCollection = async () => {
        return new Promise((resolve) => {
            try {
                const transaction = $indexedDB.transaction(['collections'], 'readonly')
                const store = transaction.objectStore('collections')
                if (!store.indexNames.contains('isFavorite')) {
                    resolve(null)
                    return
                }
                const index = store.index('isFavorite')
                const request = index.get(1)
                request.onsuccess = () => resolve(request.result || null)
                request.onerror = () => resolve(null)
            } catch (e) {
                resolve(null)
            }
        })
    }

    const isSongInFavorite = async (songNumber, variantIndex = 0) => {
        const favorite = await getFavoriteCollection()
        if (!favorite) return false
        return new Promise((resolve) => {
            try {
                const transaction = $indexedDB.transaction(['songCollections'], 'readonly')
                const store = transaction.objectStore('songCollections')
                if (!store.indexNames.contains('collectionId_songNumber_variantIndex')) {
                    resolve(false)
                    return
                }
                const index = store.index('collectionId_songNumber_variantIndex')
                const request = index.get([Number(favorite.id), Number(songNumber), Number(variantIndex)])
                request.onsuccess = () => resolve(!!request.result)
                request.onerror = () => resolve(false)
            } catch (e) {
                resolve(false)
            }
        })
    }

    const addToFavorite = async (songNumber, variantIndex = 0) => {
        const favorite = await getFavoriteCollection()
        if (!favorite) throw new Error('Подборка «Избранное» не найдена')
        return addSongToCollection(favorite.id, songNumber, variantIndex)
    }

    const removeFromFavorite = async (songNumber, variantIndex = 0) => {
        const favorite = await getFavoriteCollection()
        if (!favorite) throw new Error('Подборка «Избранное» не найдена')
        return removeSongFromCollection(favorite.id, songNumber, variantIndex)
    }

    /** Все связи «подборка — песня»: для копии и для диагностики. */
    const getAllLinks = async () => {
        return new Promise((resolve) => {
            const transaction = $indexedDB.transaction(['songCollections'], 'readonly')
            const store = transaction.objectStore('songCollections')
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => resolve([])
        })
    }

    /**
     * Снимает копию подборок в localStorage.
     *
     * Копия хранится отдельно от IndexedDB именно потому, что IndexedDB может
     * быть освобождена браузером — а localStorage при этом обычно уцелеет.
     */
    const backupCollections = async () => {
        const [collections, links] = await Promise.all([getCollections(), getAllLinks()])
        const backup = buildBackup(collections, links, new Date().toISOString())

        return saveBackupTo(typeof localStorage === 'undefined' ? null : localStorage, backup)
    }

    /**
     * Снимает копию после успешной мутации.
     *
     * Сбой копирования не должен превращаться в сбой самой операции: песня
     * добавлена в подборку — значит операция удалась, даже если хранилище
     * копий переполнено.
     */
    const withBackup = (fn) => async (...args) => {
        const result = await fn(...args)

        try {
            await backupCollections()
        } catch (e) {
            console.warn('Не удалось обновить резервную копию подборок:', e)
        }

        return result
    }

    return {
        addSongs: guardWrite(addSongs),
        getSong: guardRead(getSong, null),
        createCollection: guardWrite(withBackup(createCollection)),
        getCollections: guardRead(getCollections, []),
        reorderCollections: guardWrite(reorderCollections),
        addSongToCollection: guardWrite(withBackup(addSongToCollection)),
        removeSongFromCollection: guardWrite(withBackup(removeSongFromCollection)),
        getSongsInCollection: guardRead(getSongsInCollection, []),
        getCollectionsForSong: guardRead(getCollectionsForSong, []),
        getCollection: guardRead(getCollection, null),
        getAvailableCollections: guardRead(getAvailableCollections, []),
        deleteCollection: guardWrite(withBackup(deleteCollection)),
        getSongsCount: guardRead(getSongsCount, 0),
        getSongNumbers: guardRead(getSongNumbers, []),
        getSongsCountInCollection: guardRead(getSongsCountInCollection, 0),
        getAllSongs: guardRead(getAllSongs, []),
        addSections: guardWrite(addSections),
        getSections: guardRead(getSections, []),
        getSectionsCount: guardRead(getSectionsCount, 0),
        getAllLinks: guardRead(getAllLinks, []),
        getFavoriteCollection: guardRead(getFavoriteCollection, null),
        isSongInFavorite: guardRead(isSongInFavorite, false),
        addToFavorite: guardWrite(withBackup(addToFavorite)),
        removeFromFavorite: guardWrite(withBackup(removeFromFavorite)),
        backupCollections: guardRead(backupCollections, { saved: false, reason: 'База данных недоступна' })
    };
};
