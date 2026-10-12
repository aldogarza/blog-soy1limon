<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  /** `{ fieldKey: message }` */
  errors: Record<string, string>;
  /** Maps a field key (e.g. "alt.en") to the input id it belongs to. */
  fieldId: (key: string) => string;
  /** Increment to move focus to the summary (e.g. after a failed submit). */
  focusSignal: number;
  /** Keeps the page outline correct when the form sits inside a titled section. */
  headingLevel?: 2 | 3;
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
  <!-- No role="alert": focus moves here after a failed submit, which already reads it once. -->
  <div v-if="Object.keys(errors).length > 0" ref="box" tabindex="-1" class="error-summary">
    <component :is="`h${headingLevel ?? 2}`">
      There
      {{
        Object.keys(errors).length === 1
          ? 'is 1 problem'
          : `are ${Object.keys(errors).length} problems`
      }}
    </component>
    <ul>
      <li v-for="(message, key) in errors" :key="key">
        <a :href="`#${fieldId(String(key))}`">{{ message }}</a>
      </li>
    </ul>
  </div>
</template>
