<script setup lang="ts">
import { actions } from 'astro:actions';
import { computed, nextTick, ref } from 'vue';
import {
  fieldErrors,
  type ImageFormValues,
  imageFormSchema,
  SHARED_FIELDS,
} from '../lib/image-form.ts';
import type { InspectedUpload } from '../lib/server/media-service.ts';
import ErrorSummary from './ErrorSummary.vue';
import ImageMetadataForm from './ImageMetadataForm.vue';

defineProps<{ altRecommendedLength: number; maxUploadMb: number }>();

type Status = 'inspecting' | 'ready' | 'failed' | 'processing' | 'done';

interface Item {
  key: number;
  filename: string;
  status: Status;
  message?: string;
  upload?: InspectedUpload;
  values?: ImageFormValues;
  errors: Record<string, string>;
  result?: { id: string; seoName: string };
}

const items = ref<Item[]>([]);
const phase = ref<'select' | 'describe' | 'processing' | 'done'>('select');
const index = ref(0);
const live = ref('');
const focusSummary = ref(0);
const stepHeading = ref<HTMLElement | null>(null);
const dragging = ref(false);
let nextKey = 0;

const describable = computed(() => items.value.filter((item) => item.status === 'ready'));
const current = computed(() => describable.value[index.value]);
const failed = computed(() => items.value.filter((item) => item.status === 'failed'));
const done = computed(() => items.value.filter((item) => item.status === 'done'));

const fieldIdFor = (item: Item) => (key: string) => `img${item.key}-${key.replace('.', '-')}`;

async function focusStep() {
  await nextTick();
  stepHeading.value?.focus();
}

async function inspectFiles(files: File[]) {
  if (files.length === 0) return;
  phase.value = 'describe';
  index.value = 0;
  const added = files.map<Item>((file) => ({
    key: nextKey++,
    filename: file.name,
    status: 'inspecting',
    errors: {},
  }));
  items.value.push(...added);

  for (const [i, file] of files.entries()) {
    const item = items.value.find((candidate) => candidate.key === added[i]?.key);
    if (!item) continue;
    live.value = `Reading ${i + 1} of ${files.length}: ${file.name}`;
    const form = new FormData();
    form.set('file', file);
    const { data, error } = await actions.media.inspect(form);
    if (error) {
      item.status = 'failed';
      item.message = error.message;
    } else {
      item.status = 'ready';
      item.upload = data;
      item.values = data.values;
    }
  }
  live.value = `${describable.value.length} image(s) ready to describe.`;
  if (describable.value.length > 0) await focusStep();
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  void inspectFiles([...(input.files ?? [])]);
  input.value = '';
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  void inspectFiles([...(event.dataTransfer?.files ?? [])]);
}

function validate(item: Item): boolean {
  const result = imageFormSchema.safeParse(item.values);
  item.errors = result.success ? {} : fieldErrors(result.error);
  return result.success;
}

async function go(step: number) {
  index.value = Math.min(Math.max(step, 0), describable.value.length - 1);
  await focusStep();
}

async function next() {
  const item = current.value;
  if (item && !validate(item)) {
    focusSummary.value += 1;
    return;
  }
  await go(index.value + 1);
}

function applyToRemaining() {
  const source = current.value?.values;
  if (!source) return;
  const remaining = describable.value.slice(index.value + 1);
  for (const item of remaining) {
    if (!item.values) continue;
    for (const field of SHARED_FIELDS) item.values[field] = source[field];
  }
  live.value = `Copied creator, copyright, credit, license and keywords to ${remaining.length} image(s).`;
}

async function removeCurrent() {
  const item = current.value;
  if (!item?.upload) return;
  await actions.media.discard({ token: item.upload.token });
  items.value = items.value.filter((candidate) => candidate.key !== item.key);
  live.value = `Removed ${item.filename}.`;
  if (describable.value.length === 0) {
    phase.value = 'select';
    return;
  }
  await go(index.value);
}

async function processAll() {
  const invalidIndex = describable.value.findIndex((item) => !validate(item));
  if (invalidIndex !== -1) {
    await go(invalidIndex);
    focusSummary.value += 1;
    live.value = 'Some images need changes before processing.';
    return;
  }

  phase.value = 'processing';
  const queue = [...describable.value];
  for (const [i, item] of queue.entries()) {
    if (!item.upload || !item.values) continue;
    item.status = 'processing';
    live.value = `Processing ${i + 1} of ${queue.length}: ${item.filename}`;
    const { data, error } = await actions.media.create({
      token: item.upload.token,
      values: item.values,
    });
    if (error) {
      item.status = 'ready';
      item.message = error.message;
    } else {
      item.status = 'done';
      item.result = data;
      item.message = undefined;
    }
  }
  phase.value = 'done';
  const remaining = describable.value.length;
  live.value =
    remaining === 0
      ? `All ${queue.length} image(s) processed.`
      : `${queue.length - remaining} processed, ${remaining} need attention.`;
}

async function retryRemaining() {
  phase.value = 'describe';
  await go(0);
}
</script>

<template>
  <p class="visually-hidden" role="status">{{ live }}</p>

  <section
    v-if="phase === 'select' || (phase === 'describe' && describable.length === 0)"
    aria-labelledby="choose-heading"
  >
    <h2 id="choose-heading">Choose photos</h2>
    <div
      class="drop-zone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <label for="file-input">Photos (JPEG, PNG, WebP, AVIF, TIFF, GIF or HEIC)</label>
      <span id="file-hint" class="hint"
        >You can also drag files onto this area. Up to {{ maxUploadMb }} MB each.</span
      >
      <input
        id="file-input"
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        aria-describedby="file-hint"
        @change="onInputChange"
      />
    </div>
  </section>

  <section
    v-if="items.some((item) => item.status === 'inspecting')"
    aria-labelledby="reading-heading"
  >
    <h2 id="reading-heading">Reading files</h2>
    <ul>
      <li v-for="item in items.filter((i) => i.status === 'inspecting')" :key="item.key">
        {{ item.filename }}…
      </li>
    </ul>
  </section>

  <section v-if="failed.length > 0" aria-labelledby="failed-heading">
    <h2 id="failed-heading">Files that cannot be used</h2>
    <ul>
      <li v-for="item in failed" :key="item.key">
        <strong>{{ item.filename }}</strong
        >: {{ item.message }}
      </li>
    </ul>
  </section>

  <section
    v-if="phase === 'describe' && current && current.values && current.upload"
    aria-labelledby="step-heading"
  >
    <h2 id="step-heading" ref="stepHeading" tabindex="-1">
      Image {{ index + 1 }} of {{ describable.length }}: {{ current.filename }}
    </h2>
    <p v-if="current.message" role="alert" class="error">{{ current.message }}</p>

    <figure>
      <img
        :src="current.upload.previewUrl"
        :alt="`Preview of ${current.filename}`"
        class="upload-preview"
      />
      <figcaption class="hint">
        {{ current.upload.width }} × {{ current.upload.height }} px · {{ current.upload.mime }}
      </figcaption>
    </figure>

    <form novalidate @submit.prevent="index < describable.length - 1 ? next() : processAll()">
      <ErrorSummary
        :errors="current.errors"
        :field-id="fieldIdFor(current)"
        :focus-signal="focusSummary"
      />

      <ImageMetadataForm
        :key="current.key"
        v-model="current.values"
        :id-prefix="`img${current.key}`"
        :technical="current.upload.technical"
        :errors="current.errors"
        :alt-recommended-length="altRecommendedLength"
        :sensitive-matches="current.upload.sensitiveMatches"
      />

      <p v-if="index < describable.length - 1">
        <button type="button" @click="applyToRemaining">
          Use these credits and keywords for the remaining
          {{ describable.length - index - 1 }} image(s)
        </button>
      </p>

      <!-- Actions on the form, not site navigation: a labelled group, not <nav>. -->
      <div role="group" aria-label="Image actions" class="actions">
        <button type="button" :disabled="index === 0" @click="go(index - 1)">Previous image</button>
        <button v-if="index < describable.length - 1" type="submit">Next image</button>
        <button v-else type="submit">Process {{ describable.length }} image(s)</button>
        <button type="button" @click="removeCurrent">Remove this image</button>
      </div>
    </form>
  </section>

  <section v-if="phase === 'processing'" aria-labelledby="processing-heading">
    <h2 id="processing-heading">Processing</h2>
    <ul>
      <li
        v-for="item in items.filter((i) => ['processing', 'done', 'ready'].includes(i.status))"
        :key="item.key"
      >
        {{ item.filename }}:
        {{
          item.status === 'processing' ? 'working…' : item.status === 'done' ? 'done' : 'waiting'
        }}
      </li>
    </ul>
  </section>

  <section v-if="phase === 'done'" aria-labelledby="summary-heading">
    <h2 id="summary-heading">Summary</h2>
    <p v-if="done.length > 0">Processed images:</p>
    <ul>
      <li v-for="item in done" :key="item.key">
        <a :href="`/media/${item.result?.id}`">{{ item.result?.seoName }}</a> (from
        {{ item.filename }})
      </li>
    </ul>
    <div v-if="describable.length > 0">
      <p class="error">{{ describable.length }} image(s) could not be processed:</p>
      <ul>
        <li v-for="item in describable" :key="item.key">{{ item.filename }}: {{ item.message }}</li>
      </ul>
      <button type="button" @click="retryRemaining">Review and retry</button>
    </div>
    <p><a href="/media">Go to the media library</a> · <a href="/media/upload">Upload more</a></p>
  </section>
</template>
