export default defineNuxtPlugin(async (nuxtApp) => {
    const dbVersion = 6;

    const request = indexedDB.open('SongsDB', dbVersion);

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains('songs')) {
            db.createObjectStore('songs', { keyPath: 'number' });
        }

        if (!db.objectStoreNames.contains('collections')) {
            const collectionsStore = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true });
            collectionsStore.createIndex('name', 'name', { unique: false });
            collectionsStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        }

        if (!db.objectStoreNames.contains('songCollections')) {
            const songCollectionsStore = db.createObjectStore('songCollections', { keyPath: 'id', autoIncrement: true });
            songCollectionsStore.createIndex('collectionId', 'collectionId', { unique: false });
            songCollectionsStore.createIndex('songNumber', 'songNumber', { unique: false });
            songCollectionsStore.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: false });
            songCollectionsStore.createIndex('collectionId_songNumber_variantIndex', ['collectionId', 'songNumber', 'variantIndex'], { unique: true });
        }

        // Миграция v1→v2: body → variants
        if (oldVersion > 0 && oldVersion < 2) {
            const transaction = event.target.transaction;
            const store = transaction.objectStore('songs');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                const songs = getAllRequest.result;
                store.clear();
                for (const song of songs) {
                    if (song.body && !song.variants) {
                        store.put({
                            number: song.number,
                            title: song.title,
                            variants: [{ label: '', body: song.body }]
                        });
                    } else if (song.variants) {
                        store.put(song);
                    }
                }
            };
        }

        // Миграция v2→v3 (промежуточная — добавляла variantLabel)
        if (oldVersion >= 2 && oldVersion < 3) {
            const transaction = event.target.transaction;
            const store = transaction.objectStore('songCollections');
            store.deleteIndex('collectionId_songNumber');
            store.createIndex('collectionId_songNumber', ['collectionId', 'songNumber'], { unique: false });
            store.createIndex('collectionId_songNumber_variantLabel', ['collectionId', 'songNumber', 'variantLabel'], { unique: true });

            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
                const links = getAllRequest.result;
                store.clear();
                for (const link of links) {
                    store.put({
                        id: link.id,
                        collectionId: link.collectionId,
                        songNumber: link.songNumber,
                        variantLabel: '',
                        addedAt: link.addedAt
                    });
                }
            };
        }

        // Миграция v3→v4: variantLabel → variantIndex (число)
        if (oldVersion >= 3 && oldVersion < 4) {
            const transaction = event.target.transaction;
            const store = transaction.objectStore('songCollections');

            store.deleteIndex('collectionId_songNumber_variantLabel');
            store.createIndex('collectionId_songNumber_variantIndex', ['collectionId', 'songNumber', 'variantIndex'], { unique: true });

            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
                const links = getAllRequest.result;
                store.clear();
                for (const link of links) {
                    store.put({
                        id: link.id,
                        collectionId: link.collectionId,
                        songNumber: link.songNumber,
                        variantIndex: 0,
                        addedAt: link.addedAt
                    });
                }
            };
        }

        // Миграция v4→v5: добавляем индекс isFavorite и создаём подборку «Избранное»
        if (oldVersion >= 1 && oldVersion < 5) {
            const transaction = event.target.transaction;
            const store = transaction.objectStore('collections');

            // Добавляем индекс isFavorite, если его нет
            if (!store.indexNames.contains('isFavorite')) {
                store.createIndex('isFavorite', 'isFavorite', { unique: false });
            }

            // Создаём подборку «Избранное» с флагом isFavorite
            const index = store.index('isFavorite');
            const checkRequest = index.get(1);
            checkRequest.onsuccess = () => {
                if (!checkRequest.result) {
                    store.add({
                        name: 'Избранное',
                        isFavorite: 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                }
            };
        }

        // Миграция v5→v6: гарантируем наличие индексов isFavorite и collectionId_songNumber_variantIndex
        if (oldVersion >= 1 && oldVersion < 6) {
            const transaction = event.target.transaction;

            // Проверяем/создаём индекс isFavorite в collections
            const collectionsStore = transaction.objectStore('collections');
            if (!collectionsStore.indexNames.contains('isFavorite')) {
                collectionsStore.createIndex('isFavorite', 'isFavorite', { unique: false });
            }

            // Проверяем/создаём индекс collectionId_songNumber_variantIndex в songCollections
            const songCollectionsStore = transaction.objectStore('songCollections');
            if (!songCollectionsStore.indexNames.contains('collectionId_songNumber_variantIndex')) {
                // Удаляем старый уникальный индекс если есть
                if (songCollectionsStore.indexNames.contains('collectionId_songNumber_variantLabel')) {
                    songCollectionsStore.deleteIndex('collectionId_songNumber_variantLabel');
                }
                songCollectionsStore.createIndex('collectionId_songNumber_variantIndex', ['collectionId', 'songNumber', 'variantIndex'], { unique: true });
            }

            // Создаём подборку «Избранное» если не существует
            const index = collectionsStore.index('isFavorite');
            const checkRequest = index.get(1);
            checkRequest.onsuccess = () => {
                if (!checkRequest.result) {
                    collectionsStore.add({
                        name: 'Избранное',
                        isFavorite: 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                }
            };
        }
    };

    const db = await new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });

    // Создаём подборку «Избранное» если не существует (для новых установок)
    await new Promise((resolve) => {
        try {
            const transaction = db.transaction(['collections'], 'readwrite');
            const store = transaction.objectStore('collections');
            if (!store.indexNames.contains('isFavorite')) {
                // Индекс отсутствует — пробуем создать (возможно, база повреждена)
                resolve();
                return;
            }
            const index = store.index('isFavorite');
            const checkRequest = index.get(1);
            checkRequest.onsuccess = () => {
                if (!checkRequest.result) {
                    store.add({
                        name: 'Избранное',
                        isFavorite: 1,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve(); // не критично
        } catch (e) {
            resolve(); // не критично
        }
    });

    // Автоматическая загрузка песен при пустой базе данных
    const songsCount = await new Promise((resolve) => {
        const transaction = db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => resolve(0);
    });

    if (songsCount === 0) {
        try {
            const response = await fetch('assets/songs.json');
            if (response.ok) {
                const data = await response.json();
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['songs'], 'readwrite');
                    const store = transaction.objectStore('songs');
                    for (const song of data.songs) {
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
                        });
                    }
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = (event) => reject(event.target.error);
                });
            }
        } catch (error) {
            console.error('Ошибка автоматической загрузки песен:', error);
        }
    }

    nuxtApp.provide('indexedDB', db);
});
