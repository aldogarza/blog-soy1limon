<script setup lang="ts">
import { slugify } from '@soy1limon/core';
import { actions } from 'astro:actions';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ImageFormValues, TechnicalMetadata } from '../lib/image-form.ts';
import TextField from './TextField.vue';

const props = defineProps<{
  /** Prefix for every input id, unique per image on the page. */
  idPrefix: string;
  technical: TechnicalMetadata;
  errors: Record<string, string>;
  altRecommendedLength: number;
  /** Image being edited, so its own current name counts as available. */
  excludeId?: string;
  sensitiveMatches?: { tag: string; value: string }[];
}>();

const values = defineModel<ImageFormValues>({ required: true });

const id = (key: string) => `${props.idPrefix}-${key.replace('.', '-')}`;

// Live availability check of the SEO file name (debounced). Browser only: during server rendering
// a timer would fire on the server and call the action outside a request.
const nameStatus = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleNameCheck(seoName: string) {
  clearTimeout(timer);
  nameStatus.value = '';
  if (!seoName) return;
  timer = setTimeout(async () => {
    const { data, error } = await actions.media.checkSeoName({
      seoName,
      ...(props.excludeId ? { excludeId: props.excludeId } : {}),
    });
    if (error) return;
    nameStatus.value = data.available
      ? 'This name is available.'
      : 'Another image already uses this name.';
  }, 400);
}

watch(() => values.value.seoName, scheduleNameCheck);
onMounted(() => scheduleNameCheck(values.value.seoName));
onBeforeUnmount(() => clearTimeout(timer));

function suggestFromTitle() {
  const suggestion = slugify(values.value.title);
  if (suggestion) values.value.seoName = suggestion;
}

const camera = computed(() => {
  const c = props.technical.camera;
  if (!c) return '';
  const parts = [
    [c.make, c.model].filter(Boolean).join(' '),
    c.lens,
    c.focalLengthMm && `${c.focalLengthMm} mm`,
    c.aperture && `f/${c.aperture}`,
    c.exposureTime && `${c.exposureTime} s`,
    c.iso && `ISO ${c.iso}`,
  ];
  return parts.filter(Boolean).join(' · ');
});

const location = computed(() => {
  const l = props.technical.location;
  return l ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` : '';
});
</script>

<template>
  <div v-if="sensitiveMatches && sensitiveMatches.length > 0" class="warning" role="note">
    <p><strong>Your name appears in this file's metadata.</strong></p>
    <ul>
      <li v-for="match in sensitiveMatches" :key="match.tag">
        <code>{{ match.tag }}</code
        >: “{{ match.value }}”
      </li>
    </ul>
    <p class="hint">
      Only the fields in this form are written to the published files. Check that none of them
      contains your name unless you want it there.
    </p>
  </div>

  <fieldset>
    <legend>File name</legend>
    <TextField
      :id="id('seoName')"
      v-model="values.seoName"
      label="SEO file name"
      required
      hint="Lowercase words separated by hyphens. It becomes part of every image address, which helps search engines."
      :described-by="`${id('seoName')}-status`"
      :error="errors.seoName"
    />
    <p :id="`${id('seoName')}-status`" class="hint" aria-live="polite">{{ nameStatus }}</p>
    <button type="button" :disabled="!values.title" @click="suggestFromTitle">
      Suggest a name from the title
    </button>
  </fieldset>

  <fieldset>
    <legend>Accessibility</legend>
    <p class="hint">
      Describe what matters in the photo for someone who cannot see it. Skip “image of” or “photo
      of”. Fill in the language of the posts where you will use it.
    </p>
    <TextField
      :id="id('alt.en')"
      v-model="values.alt.en"
      label="Alt text (English)"
      lang="en"
      multiline
      :recommended-length="altRecommendedLength"
      :error="errors['alt.en']"
    />
    <TextField
      :id="id('alt.es')"
      v-model="values.alt.es"
      label="Alt text (Spanish)"
      lang="es"
      multiline
      :recommended-length="altRecommendedLength"
      :error="errors['alt.es']"
    />
    <TextField
      :id="id('caption.en')"
      v-model="values.caption.en"
      label="Caption (English, optional)"
      hint="Shown under the photo. Not embedded in the file."
      lang="en"
      multiline
      :error="errors['caption.en']"
    />
    <TextField
      :id="id('caption.es')"
      v-model="values.caption.es"
      label="Caption (Spanish, optional)"
      lang="es"
      multiline
      :error="errors['caption.es']"
    />
  </fieldset>

  <fieldset>
    <legend>Description and credits</legend>
    <p class="hint">These are embedded in the published files. Leave a field empty to remove it.</p>
    <TextField :id="id('title')" v-model="values.title" label="Title" :error="errors.title" />
    <TextField
      :id="id('description')"
      v-model="values.description"
      label="Description"
      multiline
      :error="errors.description"
    />
    <TextField
      :id="id('creator')"
      v-model="values.creator"
      label="Creator"
      :error="errors.creator"
    />
    <TextField
      :id="id('copyrightNotice')"
      v-model="values.copyrightNotice"
      label="Copyright notice"
      :error="errors.copyrightNotice"
    />
    <TextField
      :id="id('creditText')"
      v-model="values.creditText"
      label="Credit line"
      :error="errors.creditText"
    />
    <TextField
      :id="id('licenseUrl')"
      v-model="values.licenseUrl"
      type="url"
      label="License page address"
      hint="Page that explains how the photo may be used. Google Images shows it as “Licensable”."
      :error="errors.licenseUrl"
    />
    <TextField
      :id="id('keywords')"
      v-model="values.keywords"
      label="Keywords"
      hint="Separated by commas."
      :error="errors.keywords"
    />
  </fieldset>

  <fieldset>
    <legend>Location, device and capture time</legend>
    <p>
      <input :id="id('removeTechnical')" v-model="values.removeTechnical" type="checkbox" />
      <label :for="id('removeTechnical')"
        >Remove location, device and capture time from the files</label
      >
    </p>
    <p v-if="!technical.camera && !technical.location && !technical.dateTaken" class="hint">
      The original file has none of this data.
    </p>
    <ul class="plain">
      <li v-if="technical.location">
        <input
          :id="id('keepLocation')"
          v-model="values.keepLocation"
          type="checkbox"
          :disabled="values.removeTechnical"
        />
        <label :for="id('keepLocation')">Keep location ({{ location }})</label>
      </li>
      <li v-if="technical.camera">
        <input
          :id="id('keepCamera')"
          v-model="values.keepCamera"
          type="checkbox"
          :disabled="values.removeTechnical"
        />
        <label :for="id('keepCamera')">Keep device and settings ({{ camera }})</label>
      </li>
      <li v-if="technical.dateTaken">
        <input
          :id="id('keepDateTaken')"
          v-model="values.keepDateTaken"
          type="checkbox"
          :disabled="values.removeTechnical"
        />
        <label :for="id('keepDateTaken')">Keep capture time ({{ technical.dateTaken }})</label>
      </li>
    </ul>
  </fieldset>

  <fieldset>
    <legend>Watermark</legend>
    <p>
      <input :id="id('watermark')" v-model="values.watermark" type="checkbox" />
      <label :for="id('watermark')">Add the watermark to the published files</label>
    </p>
  </fieldset>
</template>
