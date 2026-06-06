<template>
  <button class="nav-btn hamburger" @click="toggleSidebar" aria-label="Меню">
    <span class="nav-btn-icon-wrap">
      <Icon name="mingcute:menu-line" size="1.5rem"/>
      <span v-if="updateAvailable" class="update-badge"></span>
    </span>
  </button>
</template>

<script setup>
const toggleSidebar = inject('toggleSidebar', () => {})
const updateAvailable = inject('updateAvailable', ref(false))
</script>

<style scoped>
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  background: none;
  border: none;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: var(--bg-secondary);
}

.nav-btn-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.update-badge {
  position: absolute;
  top: -3px;
  right: -5px;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
}
</style>
