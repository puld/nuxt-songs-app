<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span v-if="collection" class="nav-title">{{ collection.name }}</span>
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport v-if="collection && songs.length > 0" to="#navbar-right">
      <ShareButton
        v-if="canShareCollection && !shareTooLong"
        :url="shareUrl"
        :title="shareTitle"
        :text="shareText"
        aria-label="Поделиться подборкой"
      />
      <button class="nav-btn" @click="editMode = !editMode" :aria-label="editMode ? 'Готово' : 'Редактировать'">
        <span v-if="editMode" class="edit-done">Готово</span>
        <Icon v-else name="mingcute:edit-2-line" size="1.5rem"/>
      </button>
    </Teleport>
  </ClientOnly>

  <div class="collection-page">
    <div v-if="loading">
      <LoadingText />
    </div>
    <div v-else-if="!collection">
      <p>Подборка не найдена</p>
      <NuxtLink to="/">На главную</NuxtLink>
    </div>
    <div v-else>
      <!-- Ступень 3: ссылка не влезает даже сжатой. Мессенджер обрежет её
           молча, поэтому вместо ссылки предлагается файл. -->
      <div v-if="shareTooLong" class="share-fallback" data-testid="share-fallback">
        <p class="share-fallback-title">Подборка слишком велика для ссылки</p>
        <p class="share-fallback-text">
          Такую ссылку мессенджеры обрезают на полпути. Сохраните подборку файлом и пришлите его.
        </p>
        <button class="share-fallback-btn" data-testid="share-fallback-export" @click="exportCollectionFile">
          Сохранить файлом
        </button>
        <p class="share-fallback-hint">
          Получатель добавит файл в настройках, в разделе «Резервная копия подборок».
        </p>
        <p v-if="exportMessage" class="share-fallback-hint">{{ exportMessage }}</p>
      </div>

      <div v-if="songs.length === 0" class="empty">
        <p>В этой подборке пока нет песен</p>
        <NuxtLink to="/">Добавить песни</NuxtLink>
      </div>

      <div v-else class="songs-list">
        <div
          v-for="song in songs"
          :key="song.number + '-' + song.variantIndex"
          class="song-item"
          :class="{ 'edit-mode': editMode }"
        >
          <NuxtLink
            v-if="!editMode"
            :to="songLink(song)"
            class="song-link"
          >
            <span class="song-number">{{ song.number }}</span>
            <span class="song-title">{{ song.title }}</span>
            <span v-if="getVariantLabel(song) && song.variantIndex > 0" class="variant-label">({{ getVariantLabel(song) }})</span>
          </NuxtLink>
          <div v-else class="song-link">
            <span class="song-number">{{ song.number }}</span>
            <span class="song-title">{{ song.title }}</span>
            <span v-if="getVariantLabel(song) && song.variantIndex > 0" class="variant-label">({{ getVariantLabel(song) }})</span>
          </div>
          <button v-if="editMode" @click="removeSong(song)" class="remove-btn" aria-label="Удалить">
            <Icon name="mingcute:delete-2-line" size="1.25rem"/>
          </button>
        </div>
      </div>

      <div v-if="editMode && !collection.isFavorite" class="delete-collection-section">
        <button @click="deleteCollection" class="delete-collection-btn">
          <Icon name="mingcute:delete-2-line" size="1.1rem"/>
          <span>Удалить подборку</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { encodeShare } from '~/lib/collectionShare'
import { buildBackup, serializeBackup, backupFileName } from '~/lib/collectionsBackup'
import { joinUrl, songPath, collectionShareTitle, shareDataBudget, IMPORT_ROUTE } from '~/lib/share'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const { pluralize } = useUtils()
const { getSongsInCollection, getCollection, removeSongFromCollection, deleteCollection: deleteCollectionDB } = useIndexDB()
const { downloadText } = useFileDownload()

const collection = ref(null)
const songs = ref([])
const loading = ref(true)
const editMode = ref(false)
const shareUrl = ref('')
const shareTooLong = ref(false)
const exportMessage = ref('')

const songLink = (song) => songPath(song.number, song.variantIndex)

// Ссылкой делятся только пользовательскими подборками: «Избранное» есть у
// каждого своё, и подменять его чужим содержимым бессмысленно. Гейт devMode —
// потому что страница импорта у получателя ещё не готова (4.4 дорожной карты).
const canShareCollection = computed(() => (
  settings.devMode && collection.value && !collection.value.isFavorite
))

const shareTitle = computed(() => collectionShareTitle(collection.value?.name))
const shareText = computed(() => (
  `${songs.value.length} ${pluralize(songs.value.length, 'песня', 'песни', 'песен')}`
))

/**
 * Готовит адрес заранее, а не по нажатию: `navigator.share` требует жеста
 * пользователя, и вызов после `await` Safari уже не считает ответом на клик.
 */
const buildShareUrl = async () => {
  shareUrl.value = ''
  shareTooLong.value = false
  exportMessage.value = ''
  if (!canShareCollection.value || songs.value.length === 0) return

  // Бюджет считается здесь, а не в модуле: базовый адрес зависит от домена и
  // от `app.baseURL`, а на GitHub Pages приложение живёт не в корне.
  const base = joinUrl(window.location.origin, `${router.resolve(IMPORT_ROUTE).href}#`)

  const { ok, data, tooLong } = await encodeShare({
    name: collection.value.name,
    songsVersion: settings.currentSongsVersion,
    songs: songs.value.map((song) => ({ songNumber: song.number, variantIndex: song.variantIndex }))
  }, { maxLength: shareDataBudget(base) })

  if (!ok) return

  // Обрезанную ссылку отдавать нельзя: у получателя она откроется страницей
  // «ссылка испорчена», и виноватым будет выглядеть приложение.
  if (tooLong) {
    shareTooLong.value = true
    return
  }

  shareUrl.value = `${base}${data}`
}

/**
 * Ступень 3: подборка уезжает файлом резервной копии.
 *
 * Формат тот же, что у экспорта в настройках, поэтому получателю не нужен
 * отдельный приёмник — файл принимает существующий импорт.
 */
const exportCollectionFile = () => {
  const savedAt = new Date().toISOString()
  const links = songs.value.map((song) => ({
    collectionId: collection.value.id,
    songNumber: song.number,
    variantIndex: song.variantIndex,
    addedAt: savedAt
  }))

  try {
    const backup = buildBackup([collection.value], links, savedAt)
    downloadText(serializeBackup(backup), backupFileName(savedAt))
    exportMessage.value = 'Файл сохранён'
  } catch (error) {
    exportMessage.value = 'Не удалось сохранить файл: ' + error.message
  }
}

const getVariantLabel = (song) => {
  if (!song.variants) return ''
  const label = song.variants[song.variantIndex]?.label
  return label || ''
}

const removeSong = async (song) => {
  const variantLabel = getVariantLabel(song)
  const variantInfo = variantLabel && song.variantIndex > 0 ? ` (вариант ${variantLabel})` : ''
  if (!confirm(`Удалить песню${variantInfo} из подборки?`)) return

  try {
    await removeSongFromCollection(
      Number(route.params.id),
      Number(song.number),
      song.variantIndex ?? 0
    )
    songs.value = songs.value.filter(s => !(s.number === song.number && s.variantIndex === song.variantIndex))
    if (songs.value.length === 0) editMode.value = false
  } catch (error) {
    console.error('Ошибка удаления:', error)
  }
}

const deleteCollection = async () => {
  if (!confirm(`Удалить подборку «${collection.value.name}»?`)) return

  try {
    await deleteCollectionDB(Number(route.params.id))
    router.push('/')
  } catch (error) {
    console.error('Ошибка удаления подборки:', error)
  }
}

onMounted(async () => {
  try {
    const collectionId = Number(route.params.id)
    collection.value = await getCollection(collectionId)
    songs.value = await getSongsInCollection(collectionId)
  } catch (error) {
    console.error('Ошибка загрузки:', error)
  } finally {
    loading.value = false
  }
})

// Состав подборки меняется прямо на странице (удаление песни), и ссылка,
// собранная один раз при загрузке, отдавала бы уже неверный список.
watch([songs, collection, () => settings.devMode], buildShareUrl, { immediate: true })
</script>

<style scoped>
.share-fallback {
  margin-bottom: 1.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  background: var(--bg-secondary);
}

.share-fallback-title {
  margin: 0 0 0.35rem;
  font-weight: 600;
}

.share-fallback-text {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.share-fallback-btn {
  /* Сброс задан явно: до `button` правила Tailwind в этом проекте не доходят,
     иначе кнопка приезжает с дефолтными рамкой и фоном браузера. */
  box-sizing: border-box;
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: 0.5rem;
  background: var(--primary);
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
}

.share-fallback-hint {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.collection-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem;
}

.songs-list {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.song-item {
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
}

.song-item:last-child {
  border-bottom: none;
}

.song-item.edit-mode {
  background: var(--bg-secondary);
}

.song-link {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0.85rem 0.8rem;
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}

a.song-link:hover {
  background-color: var(--bg-secondary);
}

.song-number {
  font-weight: bold;
  min-width: 2.5rem;
  text-align: right;
  margin-right: 0.5rem;
  color: var(--primary);
  flex-shrink: 0;
}

.song-title {
  flex-grow: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-label {
  font-size: 0.75rem;
  color: var(--primary);
  margin-left: 0.3rem;
  flex-shrink: 0;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: none;
  color: var(--danger);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 4px;
  margin-right: 0.25rem;
}

.remove-btn:hover {
  background: var(--danger);
  color: white;
}

.edit-done {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--primary);
}

.empty {
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.delete-collection-section {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.delete-collection-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  background: none;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.delete-collection-btn:hover {
  background: var(--danger);
  color: white;
}
</style>
