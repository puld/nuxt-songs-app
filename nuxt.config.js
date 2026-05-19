export default defineNuxtConfig({
    ssr: false,

    app: {
        baseURL: '/',
        buildAssetsDir: '/_nuxt/',
        head: {
            title: 'Сборник текстов песен',
            meta: [
                {charset: 'utf-8'},
                {name: 'viewport', content: 'width=device-width, initial-scale=1'},
                {name: 'description', content: 'Оффлайн сборник текстов песен'}
            ],
            link: [
                {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'}
            ]
        }
    },

    css: [
        '@/assets/css/main.css'
    ],

    modules: [
        '@nuxt/icon',
        '@nuxtjs/color-mode',
        '@pinia/nuxt'
    ],

    colorMode: {
        preference: 'system',
        fallback: 'light',
        classSuffix: ''
    },

    compatibilityDate: '2025-04-23',

    experimental: {
        viteEnvironmentApi: true
    },

    vite: {
        server: {
            fs: {
                strict: false
            }
        },
        optimizeDeps: {
            force: true
        }
    },
    nitro: {
        experimental: {
            wasm: true
        }
    },
    server: {
        host: '0',
        port: 3000
    },
});
