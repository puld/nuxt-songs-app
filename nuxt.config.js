export default {
    target: 'static',
    ssr: false,

    head: {
        title: 'Сборник текстов песен',
        meta: [
            {charset: 'utf-8'},
            {name: 'viewport', content: 'width=device-width, initial-scale=1'},
            {name: 'description', content: 'Оффлайн сборник текстов песен'},
            { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
        ],
        link: [
            {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
            {rel: 'manifest', href: '/manifest.json'}
        ]
    },

    pwa: {
        manifest: {
            name: 'Сборник текстов песен',
            short_name: 'Песни',
            description: 'Оффлайн сборник 2000 текстов песен',
            theme_color: '#ffffff',
            icons: [
                {
                    src: '/icons/icon-72x72.png',
                    sizes: '72x72',
                    type: 'image/png'
                },
                // другие размеры иконок
            ]
        },
        workbox: {
            offline: true,
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
        'nuxt-icons',
        '@nuxt/icon',
        '@pinia/nuxt',
        '@pinia-plugin-persistedstate/nuxt'
    ],

    colorMode: {
        preference: 'system',
        fallback: 'light',
        classSuffix: ''
    },

    router: {
        base: '/<repository-name>/' // замените на имя вашего репозитория
    },

    compatibilityDate: '2025-04-20',

    nitro: {
        static: true, // Для корректного обслуживания статических файлов
    },
    vite: {
        server: {
            fs: {
                strict: false // Разрешаем доступ к файлам
            }
        }
    }
};