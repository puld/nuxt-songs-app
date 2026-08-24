<template>
  <button
    v-if="available"
    class="share-btn"
    :disabled="!url"
    :aria-label="ariaLabel"
    data-testid="share-button"
    @click="onClick"
  >
    <Icon name="mingcute:share-forward-line" size="1.5rem"/>
  </button>

  <Teleport to="body">
    <Transition name="share-toast-fade">
      <div v-if="message" class="share-toast" role="status" data-testid="share-toast">{{ message }}</div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * Кнопка «Поделиться»: системная шторка, а без неё — копирование в буфер.
 *
 * Кнопка скрывается целиком, если браузер не умеет ни того, ни другого
 * (`canShare`): показывать заведомо мёртвую кнопку хуже, чем не показывать.
 * Адрес приходит готовым — подборка кодирует его асинхронно, и пока адреса нет,
 * кнопка неактивна, а не отсутствует: иначе она появлялась бы с задержкой уже
 * после того, как пользователь посмотрел на навбар.
 */
const props = defineProps({
  url: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Поделиться' }
})

const { share, shareState, canShare } = useShare()

const available = ref(false)
onMounted(() => { available.value = canShare() })

const message = computed(() => {
  if (!shareState.value) return ''
  return shareState.value === 'copied' ? 'Ссылка скопирована' : shareState.value
})

const onClick = () => share({ title: props.title, text: props.text, url: props.url })
</script>

<style scoped>
.share-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  transition: background 0.2s;
}

.share-btn:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.share-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.share-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 2rem);
  padding: 0.6rem 1rem;
  border-radius: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text);
  font-size: 0.9rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  z-index: 400;
}

.share-toast-fade-enter-active,
.share-toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.share-toast-fade-enter-from,
.share-toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}
</style>
