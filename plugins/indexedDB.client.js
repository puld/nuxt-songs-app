export default defineNuxtPlugin(async (nuxtApp) => {
    const dbVersion = 2;

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
            songCollectionsStore.createIndex('collectionId_songNumber',['collectionId', 'songNumber'],{ unique: true })
        }

        // Миграция: преобразуем старый формат body → variants
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
    };

    const db = await new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });

    nuxtApp.provide('indexedDB', db);
});