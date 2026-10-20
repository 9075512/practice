import { onBeforeUnmount, onMounted, ref } from 'vue';

export function useMobile(breakpoint = 768) {
  const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false);

  function update() {
    isMobile.value = window.innerWidth <= breakpoint;
  }

  onMounted(() => {
    update();
    window.addEventListener('resize', update);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update);
  });

  return { isMobile };
}
