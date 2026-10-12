<script setup lang="ts">
import { actions } from 'astro:actions';
import { ref } from 'vue';
import {
  fieldErrors,
  type ImageFormValues,
  imageFormSchema,
  type TechnicalMetadata,
} from '../lib/image-form.ts';
import ErrorSummary from './ErrorSummary.vue';
import ImageMetadataForm from './ImageMetadataForm.vue';

const props = defineProps<{
  imageId: string;
  initialValues: ImageFormValues;
  technical: TechnicalMetadata;
  previewUrl?: string;
  altRecommendedLength: number;
}>();

const values = ref<ImageFormValues>(structuredClone(props.initialValues));
const errors = ref<Record<string, string>>({});
const focusSummary = ref(0);
const saving = ref(false);
const message = ref('');

const fieldId = (key: string) => `edit-${key.replace('.', '-')}`;

async function save() {
  const parsed = imageFormSchema.safeParse(values.value);
  if (!parsed.success) {
    errors.value = fieldErrors(parsed.error);
    focusSummary.value += 1;
    return;
  }
  errors.value = {};
  saving.value = true;
  message.value = 'Saving and generating new files…';
  const { error } = await actions.media.update({ id: props.imageId, values: parsed.data });
  saving.value = false;
  if (error) {
    message.value = error.message;
    return;
  }
  window.location.assign(`/media/${props.imageId}?saved`);
}
</script>

<template>
  <form novalidate @submit.prevent="save">
    <ErrorSummary :errors="errors" :field-id="fieldId" :focus-signal="focusSummary" />
    <ImageMetadataForm
      v-model="values"
      id-prefix="edit"
      :technical="technical"
      :errors="errors"
      :alt-recommended-length="altRecommendedLength"
      :exclude-id="imageId"
    />
    <p aria-live="polite" role="status">{{ message }}</p>
    <button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save changes' }}</button>
  </form>
</template>
