const pathHost = process.env.NODE_ENV === 'production' ? '/nuxt-songs-app/' : '/'

export default {
    target: 'static',
    ssr: true,

    head: {
        title: 'Сборник текстов песен',
        meta: [
            {charset: 'utf-8'},
            {name: 'viewport', content: 'width=device-width, initial-scale=1'},
            {name: 'description', content: 'Оффлайн сборник текстов песен'},
            { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
        ],
        link: [
            {rel: 'icon', type: 'image/x-icon', href: pathHost + 'favicon.ico'},
            {rel: 'manifest', href: pathHost + 'manifest.json'}
        ]
    },

    pwa: {
        registerType: 'autoUpdate',
        manifest: {
            id: "/",
            name: 'Сборник текстов песен',
            short_name: 'Песни',
            description: 'Оффлайн сборник текстов песен',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
            orientation: 'portrait',
            scope: pathHost,
            start_url: pathHost,
            icons: [
                {
                    src: 'favicon.ico',
                    sizes: '48x48',
                    type: 'image/png'
                },
                {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png'
                },
                {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png'
                }
            ]
        },
        workbox: {
            navigateFallback: pathHost,
            globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
            runtimeCaching: [
                {
                    urlPattern: '/assets/songs.json',
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'songs-cache',
                        expiration: {
                            maxEntries: 1,
                            maxAgeSeconds: 30 * 24 * 60 * 60 // 30 дней
                        }
                    }
                }
            ]
        },
        devOptions: {
            enabled: true, // Включает PWA в режиме разработки (опционально)
            type: 'module',
        },
        client: {
            installPrompt: true,
            periodicSyncForUpdates: 20
        }
    },

    css: [
        '@/assets/css/main.css'
    ],

    buildModules: [
        '@nuxtjs/pwa',
        '@nuxtjs/color-mode'
    ],

    modules: [
        '@nuxtjs/color-mode',
        '@nuxt/icon',
        '@pinia/nuxt',
        '@vite-pwa/nuxt'
    ],

    colorMode: {
        preference: 'system',
        fallback: 'light',
        classSuffix: ''
    },

    router: {
        base: '/nuxt-songs-app/',
        mode: 'hash'
    },



    app: {
        baseURL: pathHost,
        buildAssetsDir: '/_nuxt/',
        head: {
            link: [
                { rel: 'icon', type: 'image/x-icon', href: pathHost + 'favicon.ico' },
                { rel: 'icon', type: 'image/png', sizes: '16x16', href: pathHost + 'favicon-96x96.png' },
                { rel: 'apple-touch-icon', sizes: '180x180', href: pathHost + 'apple-touch-icon.png' },
                { rel: 'mask-icon', href: pathHost + 'icon.svg', color: '#ffffff' }
            ],
            meta: [
                { name: 'msapplication-TileColor', content: '#ffffff' },
                { name: 'theme-color', content: '#ffffff' }
            ]
        }
    },

    compatibilityDate: '2025-04-23',

    nitro: {
        static: true, // Для корректного обслуживания статических файлов
    },

    vite: {
        server: {
            fs: {
                strict: false // Разрешаем доступ к файлам
            }
        }
    },
    server: {
        host: '0',
        port: 3000
    },
};