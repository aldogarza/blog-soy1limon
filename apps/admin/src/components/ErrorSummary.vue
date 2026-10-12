<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  /** `{ fieldKey: message }` */
  errors: Record<string, string>;
  /** Maps a field key (e.g. "alt.en") to the input id it belongs to. */
  fieldId: (key: string) => string;
  /** Increment to move focus to the summary (e.g. after a failed submit). */
  focusSignal: number;
}>();

const box = ref<HTMLElement | null>(null);

watch(
  () => props.focusSignal,
  async () => {
    await nextTick();
    box.value?.focus();
  },
);
</script>

<template>
  <div
    v-if="Object.keys(errors).length > 0"
    ref="box"
    role="alert"
    tabindex="-1"
    class="error-summary"
  >
    <h2>
      There
      {{
        Object.keys(errors).length === 1
          ? 'is 1 problem'
          : `are ${Object.keys(errors).length} problems`
      }}
    </h2>
    <ul>
      <li v-for="(message, key) in errors" :key="key">
        <a :href="`#${fieldId(String(key))}`">{{ message }}</a>
      </li>
    </ul>
  </div>
</template>
