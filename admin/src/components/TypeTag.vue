<template>
  <span class="type-tag" :style="{ color, background: bg, borderColor: bg }">{{ type }}</span>
</template>

<script setup>
import { computed } from 'vue';
import { typeColor } from '../utils/constants.js';

const props = defineProps({
  type: { type: String, default: '' }
});

const color = computed(() => typeColor(props.type));
const bg = computed(() => `${color.value}14`);
</script>

<style scoped>
.type-tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border: 1px solid;
  border-radius: 5px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  font-weight: 500;
}
</style>
