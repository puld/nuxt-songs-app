<template>
  <ClientOnly>
    <Teleport to="#navbar-left">
      <NavBarBack />
    </Teleport>
  </ClientOnly>

  <ClientOnly>
    <Teleport to="#navbar-center">
      <span class="nav-title">Подборка по ссылке</span>
    </Teleport>
  </ClientOnly>

  <div class="import-page">
    <!-- Гейт скрывает вход, но не закрывает маршрут: статика генерируется для
         всех маршрутов, и прямой заход должен объяснять, а не показывать пустоту. -->
    <div v-if="!settings.devMode" class="stub">
      <p class="stub-title">Экспериментальный экран</p>
      <p class="stub-text">Подборки по ссылке пока доступны только в режиме разработчика.</p>
      <NuxtLink to="/" class="stub-link">На главную</NuxtLink>
    </div>

    <template v-else-if="loading">
      <LoadingText />
    </template>

    <div v-else-if="error" class="notice notice-error">
      <p class="notice-title">Ссылка не открывается</p>
      <p class="notice-text">{{ error }}</p>
      <NuxtLink to="/" class="stub-link">На главную</NuxtLink>
    </div>

    <div v-else-if="versionStatus === VERSION_OUTDATED" class="notice notice-error">
      <p class="notice-title">База песен устарела</p>
      <p class="notice-text">
        Подборку собрали на более новой базе песен. Обновите базу и откройте ссылку ещё раз —
        иначе часть песен не найдётся.
      </p>
      <button class="primary-btn" :disabled="updating" @click="updateSongs">
        {{ updating ? 'Обновление…' : 'Обновить базу песен' }}
      </button>
    </div>

    <template v-else>
      <h1 class="import-title">{{ shared.name }}</h1>
      <p class="import-subtitle">
        {{ plan.toSave.length }} {{ pluralize(plan.toSave.length, 'песня', 'песни', 'песен') }} из ссылки
      </p>

      <div v-if="versionStatus === VERSION_AHEAD" class="notice notice-warning">
        Подборка собрана на более старой базе песен — стоит проверить варианты песен.
      </div>

      <div v-if="plan.missing > 0" class="notice notice-warning">
        {{ plan.missing }} {{ pluralize(plan.missing, 'песня', 'песни', 'песен') }} не найдено в вашей базе —
        {{ plan.missing === 1 ? 'она будет пропущена' : 'они будут пропущены' }}.
      </div>

      <div v-if="plan.adjusted > 0" class="notice notice-warning">
        У {{ plan.adjusted }} {{ pluralize(plan.adjusted, 'песни', 'песен', 'песен') }}
        нет присланного варианта — сохраним основной.
      </div>

      <ul class="songs-list">
        <li
          v-for="item in plan.items"
          :key="`${item.songNumber}-${item.requestedVariantIndex ?? 0}`"
          class="song-item"
          :class="{ missing: item.status === ITEM_MISSING }"
          data-testid="import-song"
        >
          <span class="song-number">{{ item.songNumber }}</span>
          <span class="song-title">{{ item.title || 'Нет в вашей базе песен' }}</span>
          <span v-if="item.status === ITEM_VARIANT_FALLBACK" class="song-note">основной вариант</span>
        </li>
      </ul>

      <div v-if="saved" class="notice notice-success" data-testid="import-saved">
        <p class="notice-title">Сохранено в «{{ saved.name }}»</p>
        <NuxtLink :to="`/collections/${saved.id}`" class="stub-link">Открыть подборку</NuxtLink>
      </div>

      <template v-else>
        <div class="name-field">
          <label class="name-label" for="import-name">Название подборки</label>
          <input
            id="import-name"
            v-model="name"
            class="name-input"
            data-testid="import-name"
            placeholder="Название подборки"
            autocomplete="off"
          >
          <p v-if="!trimmedName" class="name-hint">Без названия подборку не сохранить.</p>
        </div>

        <p v-if="sameName" class="notice notice-warning" data-testid="import-same-name">
          У вас уже есть подборка «{{ sameName.name }}». Можно добавить песни в неё
          или сохранить отдельно как «{{ freeName }}».
        </p>

        <div class="actions">
          <button
            v-if="sameName"
            class="primary-btn"
            :disabled="!canSave"
            data-testid="import-merge"
            @click="save({ merge: true })"
          >
            Добавить в «{{ sameName.name }}»
          </button>
          <button
            class="primary-btn"
            :class="{ secondary: !!sameName }"
            :disabled="!canSave"
            data-testid="import-save"
            @click="save({ merge: false })"
          >
            {{ sameName ? `Сохранить как «${freeName}»` : 'Сохранить подборку' }}
          </button>
        </div>

        <p v-if="saveError" class="notice notice-error">{{ saveError }}</p>
      </template>
    </template>
  </div>
</template>

<script setup>
/**
 * Приём подборки по ссылке: `/collections/import#<data>`.
 *
 * Данные приходят во фрагменте — он не уходит на сервер, поэтому серверного
 * ограничения длины нет и содержимое подборки не попадает в логи чужих хостов.
 */
import { useSettingsStore } from '~/stores/settings'
import { decodeShare } from '~/lib/collectionShare'
import { buildSongsMap } from '~/lib/songsIndex'
import {
  checkSongsVersion,
  planShareImport,
  findSameNameCollection,
  uniqueCollectionName,
  VERSION_OUTDATED,
  VERSION_AHEAD,
  ITEM_MISSING,
  ITEM_VARIANT_FALLBACK
} from '~/lib/collectionImport'

const route = useRoute()
const settings = useSettingsStore()
const { pluralize } = useUtils()
const { getAllSongs, getCollections, createCollection, addSongToCollection } = useIndexDB()
const { fetchSongs } = useSongs()

const loading = ref(true)
const updating = ref(false)
const saving = ref(false)
const error = ref('')
const saveError = ref('')
const shared = ref(null)
const plan = ref({ items: [], toSave: [], missing: 0, adjusted: 0 })
const collections = ref([])
const saved = ref(null)
const versionStatus = ref('')

/**
 * Имя, под которым подборка ляжет в базу: из ссылки, но правится получателем.
 *
 * Присланное имя осмысленно у отправителя («Рождество»), а у получателя таких
 * ссылок может быть несколько от разных людей — и различать их иначе нечем.
 * Поэтому от этого поля, а не от имени из ссылки, считаются и совпадение с
 * существующей подборкой, и свободное имя рядом с ней.
 */
const name = ref('')
const trimmedName = computed(() => name.value.trim())

const sameName = computed(() => findSameNameCollection(trimmedName.value, collections.value))
const freeName = computed(() => uniqueCollectionName(trimmedName.value, collections.value))
const canSave = computed(() => !saving.value && !!trimmedName.value && plan.value.toSave.length > 0)

/**
 * Фрагмент читается из `location`, а не из `route.hash`: роутер отдаёт его уже
 * декодированным, а payload — base64url, где `+` и `/` не встречаются, зато
 * встречается `-`; лишнее декодирование по дороге ничего не улучшает.
 */
const readPayload = () => (typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''))

const load = async () => {
  loading.value = true
  error.value = ''
  saveError.value = ''
  saved.value = null
  shared.value = null
  name.value = ''
  versionStatus.value = ''
  plan.value = { items: [], toSave: [], missing: 0, adjusted: 0 }

  const data = readPayload()
  if (!data) {
    error.value = 'В ссылке нет данных подборки. Возможно, она обрезалась при пересылке.'
    loading.value = false
    return
  }

  const decoded = await decodeShare(data)
  if (!decoded.ok) {
    error.value = decoded.error
    loading.value = false
    return
  }

  shared.value = decoded.collection
  name.value = decoded.collection.name
  versionStatus.value = checkSongsVersion(decoded.collection.songsVersion, settings.currentSongsVersion)

  if (versionStatus.value !== VERSION_OUTDATED) {
    // Карта строится здесь, а не через useSongsCache: страница открывается один
    // раз по ссылке, и держать ради неё песни в модульном кэше незачем.
    const songs = await getAllSongs()
    plan.value = planShareImport(decoded.collection.songs, buildSongsMap(songs))
    collections.value = await getCollections()
  }

  loading.value = false
}

const updateSongs = async () => {
  updating.value = true
  const ok = await fetchSongs()
  updating.value = false

  if (ok) await load()
}

const save = async ({ merge }) => {
  saving.value = true
  saveError.value = ''

  try {
    const collectionId = merge && sameName.value
      ? sameName.value.id
      : await createCollection(freeName.value)

    // Имя могли поправить — заголовок сохранённого блока должен совпасть с тем,
    // что легло в базу, а не с присланным.
    const savedName = merge && sameName.value ? sameName.value.name : freeName.value

    // Дубликат связи — не ошибка: часть песен уже могла лежать в подборке,
    // и импорт по смыслу добавляет недостающее, а не переписывает список.
    for (const item of plan.value.toSave) {
      try {
        await addSongToCollection(collectionId, item.songNumber, item.variantIndex)
      } catch {
        continue
      }
    }

    saved.value = { id: collectionId, name: savedName }
  } catch (err) {
    console.error('Ошибка импорта подборки:', err)
    saveError.value = 'Не удалось сохранить подборку'
  } finally {
    saving.value = false
  }
}

onMounted(load)

/**
 * Вторая ссылка, открытая при уже открытой странице, меняет только фрагмент —
 * документ не перезагружается и `onMounted` не повторяется. Без этого watch
 * получатель видел бы прежнюю подборку и сохранил бы не то, что прислали.
 */
watch(() => route.hash, load)
</script>

<style scoped>
.import-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem;
}

.import-title {
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.25rem;
}

.import-subtitle {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.notice {
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text);
}

.notice-warning {
  border-color: var(--primary);
}

.notice-error {
  border-color: var(--danger);
}

.notice-success {
  border-color: var(--primary);
}

.notice-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.notice-text {
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.songs-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  overflow: hidden;
}

.song-item {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--border-color);
}

.song-item:last-child {
  border-bottom: none;
}

.song-item.missing {
  opacity: 0.5;
}

.song-number {
  color: var(--primary);
  font-weight: 600;
  min-width: 2.5rem;
  text-align: right;
}

.song-title {
  color: var(--text);
  flex: 1;
  min-width: 0;
}

.song-note {
  color: var(--text-secondary);
  font-size: 0.8rem;
  white-space: nowrap;
}

.name-field {
  margin-bottom: 1rem;
}

.name-label {
  display: block;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-bottom: 0.35rem;
}

.name-input {
  width: 100%;
  /* Без этого паддинги и рамка прибавляются к 100% и поле вылезает за колонку:
     сброс Tailwind до input не доходит. */
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--bg);
  color: var(--text);
  font-size: 1rem;
}

.name-input:focus {
  outline: none;
  border-color: var(--primary);
}

.name-hint {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-top: 0.35rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.primary-btn {
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: var(--primary);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary-btn.secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border-color);
}

.stub {
  text-align: center;
  padding: 2rem 1rem;
}

.stub-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.5rem;
}

.stub-text {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.stub-link {
  color: var(--primary);
  text-decoration: none;
}
</style>
