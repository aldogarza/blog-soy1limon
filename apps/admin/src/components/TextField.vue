<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    hint?: string;
    error?: string;
    multiline?: boolean;
    type?: 'text' | 'url';
    /** Shows "n / max recommended" under the field (not enforced). */
    recommendedLength?: number;
    lang?: string;
  }>(),
  {
    hint: undefined,
    error: undefined,
    multiline: false,
    type: 'text',
    recommendedLength: undefined,
    lang: undefined,
  },
);

const model = defineModel<string>({ required: true });

const hintId = computed(() => `${props.id}-hint`);
const errorId = computed(() => `${props.id}-error`);
const counterId = computed(() => `${props.id}-counter`);
const describedBy = computed(
  () =>
    [
      props.hint && hintId.value,
      props.recommendedLength && counterId.value,
      props.error && errorId.value,
    ]
      .filter(Boolean)
      .join(' ') || undefined,
);
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <span v-if="hint" :id="hintId" class="hint">{{ hint }}</span>
    <textarea
      v-if="multiline"
      :id="id"
      v-model="model"
      rows="3"
      :lang="lang"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    />
    <input
      v-else
      :id="id"
      v-model="model"
      :type="type"
      :lang="lang"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      autocomplete="off"
    />
    <span v-if="recommendedLength" :id="counterId" class="hint">
      {{ model.length }} of about {{ recommendedLength }} characters
    </span>
    <p v-if="error" :id="errorId" class="error">{{ error }}</p>
  </div>
</template>
