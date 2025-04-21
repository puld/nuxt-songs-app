export default defineNuxtPlugin(async (nuxtApp) => {
    const dbVersion = 1.1;

    const request = indexedDB.open('SongsDB', dbVersion);

    request.onupgradeneeded = (event) => {
        const db = event.target.result;

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
    };

    const db = await new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });

    nuxtApp.provide('indexedDB', db);
});