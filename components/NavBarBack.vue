<template>
  <button class="nav-btn" @click="$router.back()" aria-label="Назад">
    <Icon name="mingcute:arrow-left-line" size="1.5rem"/>
  </button>
</template>

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
</style>
