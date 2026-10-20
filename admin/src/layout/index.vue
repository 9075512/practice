<template>
  <div class="shell">
    <Sidebar :open="menuOpen" @close="menuOpen = false" />
    <div v-if="menuOpen" class="mask" @click="menuOpen = false"></div>

    <div class="main">
      <Navbar @toggle-menu="menuOpen = !menuOpen" />
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Sidebar from './Sidebar.vue';
import Navbar from './Navbar.vue';

const route = useRoute();
const menuOpen = ref(false);

watch(
  () => route.path,
  () => {
    menuOpen.value = false;
  }
);
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  background: #f4f6fb;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  padding: 8px 28px 32px;
  max-width: 1560px;
  width: 100%;
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  z-index: 90;
}

@media (max-width: 900px) {
  .content {
    padding: 4px 12px calc(24px + env(safe-area-inset-bottom));
  }
}
</style>
