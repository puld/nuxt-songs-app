// Единый источник правды для CSS-селекторов E2E тестов.
// При переименовании классов в компонентах — менять только здесь.
//
// Структура повторяет UI-архитектуру приложения:
//   search     — SongSearchInput (главная + popover песни)
//   navbar     — глобальный chrome (app-bar + слоты left/center/right)
//   sidebar    — боковое меню
//   home       — главная страница
//   song       — страница песни (текст, варианты, навигация)
//   chips      — чипы подборок на странице песни
//   goto       — popover «Перейти к песне»
//   popup      — попап добавления в подборку
//   settings   — страница настроек
//   collection — страница подборки
//   layout     — корневой контейнер

export const s = {
  // === SongSearchInput (используется на главной и в popover песни) ===
  search: {
    input: '.search-input',
    form: '.search-form',
    button: '.search-btn',
    results: '.search-results',
    resultItem: '.result-item',
    resultNumber: '.result-item .song-number',
    resultTitle: '.result-item .song-title',
    resultVariant: '.result-item .variant-label',
  },

  // === Navbar (глобальный chrome) ===
  navbar: {
    bar: '.app-bar',
    barHidden: '.app-bar-hidden',
    left: '#navbar-left',
    center: '#navbar-center',
    right: '#navbar-right',
    title: '.nav-title',
    titleBtn: '.nav-title-btn',
    arrow: '.nav-arrow',
    favoriteStar: '.favorite-star',
    favoriteStarActive: '.favorite-star.active',
    // Кнопки идентифицируются по aria-label — стабильно к смене иконок.
    menuBtn: '[aria-label="Меню"]',
    backBtn: '[aria-label="Назад"]',
    prevBtn: '[aria-label="Предыдущая песня"]',
    nextBtn: '[aria-label="Следующая песня"]',
    gotoBtn: '[aria-label="Перейти к песне"]',
    favoriteBtn: '[aria-label="Избранное"]',
  },

  // === Sidebar ===
  sidebar: {
    aside: '.sidebar',
    overlay: '.sidebar-overlay',
    link: '.sidebar-link',
    collectionLink: '.sidebar-collection-link',
    collectionName: '.sidebar-collection-name',
    collectionCount: '.sidebar-collection-count',
    sectionHeader: '.sidebar-section-header',
    bottom: '.sidebar-bottom',
    closeBtn: '.sidebar-close-btn',
    favoriteIcon: '.favorite-icon',
    updateBadge: '.update-badge',
  },

  // === Главная страница ===
  home: {
    welcomeScreen: '.welcome-screen',
    searchContainer: '.search-container',
    instructions: '.instructions',
    instructionExtended: '.instruction-extended',
    instructionText: '.instruction-text',
    installBtn: '.install-btn',
    loadingText: '.loading-text',
    updateLink: 'a:has-text("Обновить в настройках")',
  },

  // === Страница песни: текст и варианты ===
  song: {
    title: 'h1.song-title',
    titleRow: '.song-title-row',
    container: '.song-container',
    contentWrapper: '.song-content-wrapper',
    part: '.song-part',
    verse: '.song-part.verse',
    chorus: '.song-part.chorus',
    partLabel: '.part-label',
    chorusLabel: '.chorus-label',
    content: '.content',
    variantTabs: '.variant-tabs',
    variantTab: '.variant-tab',
    variantTabActive: '.variant-tab.active',
    chord: '.chord',
    chordUp: '.chord-up',
    repeat: '.repeat',
    stageDirection: '.stage-direction',
    notFound: 'text=Песня не найдена',
    backHome: 'a:has-text("Вернуться на главную")',
  },

  // === Чипы подборок на странице песни ===
  chips: {
    section: '.collections-section',
    chip: '.collection-chip',
    chipName: '.chip-name',
    variantBadge: '.variant-badge',
    chipRemove: '.chip-remove',
    chipAdd: '.chip-add',
  },

  // === Popover «Перейти к песне» ===
  goto: {
    overlay: '.goto-overlay',
    popover: '.goto-popover',
  },

  // === Попап добавления в подборку ===
  popup: {
    overlay: '.popup-overlay',
    content: '.popup-content',
    title: '.popup-title',
    collectionItem: '.popup-collection-item',
    collectionName: '.popup-collection-name',
    collectionCount: '.popup-collection-count',
    favoriteIcon: '.favorite-icon',
    empty: '.popup-empty',
    divider: '.popup-divider',
    form: '.popup-create',
    input: '.popup-input',
    createBtn: '.popup-create-btn',
  },

  // === Настройки ===
  settings: {
    section: '.setting-section',
    toggleSwitch: '.toggle-switch',
    slider: '.slider',
    toggleLabel: '.toggle-label',
    hint: '.setting-hint',
    updateBtn: 'button:has-text("Обновить")',
    success: '.success',
    error: '.error',
  },

  // === Страница подборки ===
  collection: {
    page: '.collection-page',
    songsList: '.songs-list',
    songItem: '.song-item',
    songItemEdit: '.song-item.edit-mode',
    songLink: '.song-link',
    songNumber: '.song-item .song-number',
    songTitle: '.song-item .song-title',
    variantLabel: '.song-item .variant-label',
    removeBtn: '.remove-btn',
    editBtn: '[aria-label="Редактировать"]',
    doneBtn: '[aria-label="Готово"]',
    editDone: '.edit-done',
    deleteSection: '.delete-collection-section',
    deleteBtn: '.delete-collection-btn',
    empty: 'text=В этой подборке пока нет песен',
    addSongsLink: 'a:has-text("Добавить песни")',
    notFound: 'text=Подборка не найдена',
    homeLink: 'a:has-text("На главную")',
  },

  // === Корневой layout ===
  layout: {
    root: '.layout',
    pageContent: '.page-content',
  },
}
