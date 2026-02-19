module.exports = {
    content: [
        "./components/**/*.{js,vue,ts}",
        "./layouts/**/*.vue",
        "./pages/**/*.vue",
        "./plugins/**/*.{js,ts}",
        "./app.vue",
        "./error.vue"
    ],
    postcss: {
        plugins: {
            tailwindcss: {},
            autoprefixer: {},
        },
    },
    theme: {
        extend: {
            colors: {
                primary: '#3b82f6',    // Синий
                danger: '#ef4444',     // Красный
                'bg': 'var(--bg)',
                'bg-secondary': 'var(--bg-secondary)',
                'text': 'var(--text)',
                'text-secondary': 'var(--text-secondary)',
                'border-color': 'var(--border-color)',
                'chord': 'var(--chord-color)'
            },
            spacing: {
                'app-bar': '56px'
            }
        }
    },
    plugins: []
}