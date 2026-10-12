<script setup lang="ts">
import { computed, ref, useId } from 'vue';

export interface ImageOption {
  id: string;
  seoName: string;
  alt: { en?: string; es?: string };
  thumbUrl: string;
  thumbWidth: number;
  thumbHeight: number;
}

const props = defineProps<{
  images: ImageOption[];
  heading: string;
  confirmLabel: string;
  multiple?: boolean;
  /** Language of the post: shows that alt text and flags images that lack it. */
  lang: 'en' | 'es';
}>();

const emit = defineEmits<{ select: [ids: string[]] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const query = ref('');
const chosen = ref<string[]>([]);
// useId() is stable between the server render and hydration; Math.random() was not.
const uid = `picker-${useId()}`;

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.images;
  return props.images.filter((image) =>
    [image.seoName, image.alt.en, image.alt.es].filter(Boolean).join(' ').toLowerCase().includes(q),
  );
});

function open() {
  chosen.value = [];
  query.value = '';
  dialog.value?.showModal();
}

function confirm() {
  if (chosen.value.length > 0) emit('select', [...chosen.value]);
  dialog.value?.close();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" :aria-labelledby="`${uid}-heading`" class="picker">
    <form method="dialog" @submit.prevent="confirm">
      <h2 :id="`${uid}-heading`">{{ heading }}</h2>
      <label :for="`${uid}-search`">Search by name or alt text</label>
      <input :id="`${uid}-search`" v-model="query" type="search" />
      <p v-if="images.length === 0">
        No images yet. <a href="/media/upload">Upload images</a> first.
      </p>
      <p v-else role="status">{{ visible.length }} of {{ images.length }} images</p>
      <fieldset>
        <legend class="visually-hidden">{{ heading }}</legend>
        <ul class="grid">
          <li v-for="image in visible" :key="image.id">
            <input
              v-if="multiple"
              :id="`${uid}-${image.id}`"
              v-model="chosen"
              type="checkbox"
              :value="image.id"
            />
            <input
              v-else
              :id="`${uid}-${image.id}`"
              type="radio"
              :name="`${uid}-choice`"
              :value="image.id"
              :checked="chosen[0] === image.id"
              @change="chosen = [image.id]"
            />
            <label :for="`${uid}-${image.id}`">
              <img
                :src="image.thumbUrl"
                alt=""
                :width="image.thumbWidth"
                :height="image.thumbHeight"
                loading="lazy"
              />
              <span>{{ image.seoName }}</span>
              <span v-if="image.alt[lang]" class="hint" :lang="lang">{{ image.alt[lang] }}</span>
              <span v-else class="hint"
                >No alt text in {{ lang === 'en' ? 'English' : 'Spanish' }} yet</span
              >
            </label>
          </li>
        </ul>
      </fieldset>
      <p class="actions">
        <button type="submit" :disabled="chosen.length === 0">{{ confirmLabel }}</button>
        <button type="button" @click="dialog?.close()">Cancel</button>
      </p>
    </form>
  </dialog>
</template>
