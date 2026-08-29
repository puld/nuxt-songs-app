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
//   about      — страница «О приложении» (шпаргалка + версия + dev-режим)
//   collection — страница подборки
//   songsList  — страница «Все песни» (группировка по номеру/алфавиту/разделам)
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
    // Метка «есть аккорды» — только при включённых аккордах
    resultChordMark: '.result-item .chord-mark',
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
    // Ручная сортировка подборок (за devMode)
    reorderToggle: '[data-testid="reorder-toggle"]',
    collectionsList: '.sidebar-collections',
    liftedRow: '.sidebar-collection-row.is-lifted',
    collectionRow: '[data-testid="sidebar-collection"]',
    collectionHandle: '[data-testid="collection-handle"]',
    collectionUp: '[data-testid="collection-up"]',
    collectionDown: '[data-testid="collection-down"]',
  },

  // === Главная страница ===
  home: {
    welcomeScreen: '.welcome-screen',
    searchContainer: '.search-container',
    instructions: '.instructions',
    instructionExtended: '.instruction-extended',
    instructionText: '.instruction-text',
    instructionMore: '.instruction-more',
    installBtn: '.install-btn',
    recent: '.recent',
    recentTitle: '.recent-title',
    recentItem: '.recent-item',
    recentNumber: '.recent-number',
    recentName: '.recent-name',
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
    // Аккорды: `{_G}` в строке — `.chord`, `{Am}` над строкой — `.chord-label`
    chord: '.chord',
    chordLabel: '.chord-label',
    // Панель подбора тональности (за devMode + включёнными аккордами)
    chordBar: '.chord-bar',
    chordKeyName: '.chord-key-name',
    chordKeyShift: '.chord-key-shift',
    chordDown: '[aria-label="Тоном ниже"]',
    chordUp: '[aria-label="Тоном выше"]',
    chordReset: '[aria-label="Исходная тональность"]',
    repeat: '.repeat',
    // Маркеры / и /Nр. — у развёрнутого повтора их нет
    repeatMarker: '.repeat-marker',
    stageDirection: '.stage-direction',
    // Раздел сборника — ссылка на /songs?section=<id>, только при devMode
    sectionLink: '.section-link',
    sectionLinkTitle: '.section-link .section-link-title',
    notFound: 'text=Песня не найдена',
    backHome: 'a:has-text("Вернуться на главную")',
  },

  // === Кнопка «Поделиться» (страница песни и страница подборки) ===
  share: {
    button: '[data-testid="share-button"]',
    toast: '[data-testid="share-toast"]',
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
    // Главный тоггл — на /settings, остальные три — на /settings/chords,
    // где общий селектор неоднозначен
    chordsToggle: '.toggle-switch.chords-toggle',
    simplifyChordsToggle: '.toggle-switch.simplify-toggle',
    forceSharpToggle: '.toggle-switch.force-sharp-toggle',
    germanNotationToggle: '.toggle-switch.german-notation-toggle',
    slider: '.slider',
    toggleLabel: '.toggle-label',
    hint: '.setting-hint',
    updateBtn: 'button:has-text("Обновить")',
    success: '.success',
    error: '.error',
  },

  // === Страница «О приложении» ===
  about: {
    page: '.about',
    section: '.about-section',
    guideItem: '.guide-item',
    guideTitle: '.guide-title',
    guideText: '.guide-text',
    versionBtn: '.version-btn',
    versionValue: '.version-value',
    devModeMessage: '.dev-mode-message',
    devModeStatus: '.dev-mode-status',
    // Блок диагностики «Состояние хранилища»
    diagnostics: '[data-testid="diagnostics-section"]',
    diagnosticsRow: '[data-testid="diagnostics-row"]',
    diagnosticsValue: '.diagnostics-value',
    diagnosticsError: '[data-testid="diagnostics-error"]',
    // Секция «Что нового» — только в режиме разработчика
    changelog: '[data-testid="changelog-section"]',
    changelogItem: '.changelog-item',
    changelogVersion: '.changelog-version',
    changelogToggle: '[data-testid="changelog-toggle"]',
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
    // Ступень 3 деградации ссылки: подборка не влезает даже сжатой
    shareFallback: '[data-testid="share-fallback"]',
    shareFallbackExport: '[data-testid="share-fallback-export"]',
    empty: 'text=В этой подборке пока нет песен',
    addSongsLink: 'a:has-text("Добавить песни")',
    notFound: 'text=Подборка не найдена',
    homeLink: 'a:has-text("На главную")',
  },

  // === Страница подборки по ссылке (/collections/import#<data>) ===
  collectionImport: {
    page: '.import-page',
    stub: '.import-page .stub',
    subtitle: '.import-subtitle',
    song: '[data-testid="import-song"]',
    songNumber: '[data-testid="import-song"] .song-number',
    songTitle: '[data-testid="import-song"] .song-title',
    songNote: '[data-testid="import-song"] .song-note',
    nameInput: '[data-testid="import-name"]',
    nameHint: '.import-page .name-hint',
    sameName: '[data-testid="import-same-name"]',
    separateBtn: '[data-testid="import-separate"]',
    saveBtn: '[data-testid="import-save"]',
    saved: '[data-testid="import-saved"]',
    error: '.import-page .notice-error',
    warning: '.import-page .notice-warning',
    updateBtn: 'button:has-text("Обновить базу песен")',
  },

  // === Страница «Все песни» (список с группировкой) ===
  songsList: {
    page: '.songs-page',
    stub: '.songs-page .stub',
    stubLink: '.songs-page .stub-link',
    modes: '.songs-page .modes',
    modeBtn: '.songs-page .mode-btn',
    modeActive: '.songs-page .mode-btn.active',
    group: '.songs-page .group',
    groupHeader: '.songs-page .group-header',
    groupTitle: '.songs-page .group-title',
    groupCount: '.songs-page .group-count',
    songLink: '.songs-page .song-link',
    // Группа по ключу — им же адресуется переход `?section=<id>`
    groupByKey: (key) => `.songs-page .group[data-group-key="${key}"]`,
    songNumber: '.songs-page .song-link .song-number',
    songTitle: '.songs-page .song-link .song-title',
    // Метка «есть аккорды» — только при включённых аккордах
    chordMark: '.songs-page .song-link .chord-mark',
    searchBtn: '[aria-label="Найти песню"]',
    // Входы на экран — оба под флагом режима разработчика
    homeLink: '.songs-link',
    sidebarLink: '.sidebar-link:has-text("Все песни")',
  },

  // === Корневой layout ===
  layout: {
    root: '.layout',
    pageContent: '.page-content',
  },

  // === Предложение восстановить подборки из резервной копии ===
  backup: {
    toast: '[data-testid="restore-backup-toast"]',
    apply: '[data-testid="restore-backup-apply"]',
    dismiss: '[data-testid="restore-backup-dismiss"]',
    // Секция «Резервная копия подборок» на странице настроек
    section: '[data-testid="backup-section"]',
    exportBtn: '[data-testid="backup-export"]',
    importBtn: '[data-testid="backup-import"]',
    fileInput: '[data-testid="backup-file-input"]',
    message: '[data-testid="backup-message"]',
  },
}
