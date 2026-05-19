export default defineNuxtPlugin(async (nuxtApp) => {
    const dbVersion = 4;

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
    };

    const db = await new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });

    nuxtApp.provide('indexedDB', db);
});
