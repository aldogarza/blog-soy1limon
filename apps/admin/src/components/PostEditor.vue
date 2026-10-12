<script setup lang="ts">
import { slugify } from '@soy1limon/core';
import { actions } from 'astro:actions';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { triggerMessage } from '../lib/deploy.ts';
import { fieldErrors } from '../lib/image-form.ts';
import { move, type PostFormValues, postFormSchema, publicPath } from '../lib/post-form.ts';
import ErrorSummary from './ErrorSummary.vue';
import ImagePicker, { type ImageOption } from './ImagePicker.vue';
import RevisionHistory from './RevisionHistory.vue';
import TextField from './TextField.vue';

type Status = 'draft' | 'scheduled' | 'published' | 'archived';
interface TagOption {
  id: string;
  slug: string;
  labels: { en?: string; es?: string };
}

const props = defineProps<{
  postId: string;
  initialValues: PostFormValues;
  status: Status;
  publishedAt: string | null;
  updatedAt: string;
  previousSlugs: string[];
  tags: TagOption[];
  images: ImageOption[];
  translationOptions: { id: string; title: string; lang: 'en' | 'es' }[];
  revisions: { id: string; createdAt: string }[];
  titleRecommended: number;
  descriptionRecommended: number;
}>();

const values = ref<PostFormValues>(structuredClone(props.initialValues));
const tags = ref<TagOption[]>([...props.tags]);
const status = ref<Status>(props.status);
const publishedAt = ref<string | null>(props.publishedAt);
const previousSlugs = ref<string[]>([...props.previousSlugs]);
const errors = ref<Record<string, string>>({});
const focusSummary = ref(0);
const live = ref('');
const saveState = ref<'saved' | 'unsaved' | 'saving' | 'failed'>('saved');
const serverErrors = ref<string[]>([]);
/** Whether the public site is being rebuilt after the last change; empty when nothing went live. */
const deployMessage = ref('');
const scheduleAt = ref('');
const restoreOffer = ref<{ values: PostFormValues; savedAt: string } | null>(null);

const imageById = computed(() => new Map(props.images.map((image) => [image.id, image])));
const fieldId = (key: string) => `post-${key.replace('.', '-')}`;
const storageKey = `soy1limon:post-draft:${props.postId}`;

// ---------------------------------------------------------------------------
// Slug: follows the title while the post is a new draft, until edited by hand.
// ---------------------------------------------------------------------------
const slugFollowsTitle = ref(
  props.status === 'draft' &&
    props.initialValues.slug.startsWith(slugify(props.initialValues.title) || 'untitled'),
);
const slugStatus = ref('');
let slugTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => values.value.title,
  (title) => {
    if (slugFollowsTitle.value) values.value.slug = slugify(title) || values.value.slug;
  },
);
watch(
  () => [values.value.slug, values.value.lang] as const,
  ([slug, lang]) => {
    clearTimeout(slugTimer);
    slugStatus.value = '';
    if (!slug) return;
    slugTimer = setTimeout(async () => {
      const { data } = await actions.posts.checkSlug({ lang, slug, excludeId: props.postId });
      if (data)
        slugStatus.value = data.available
          ? 'This address is available.'
          : 'Another post already uses this address.';
    }, 400);
  },
);

// ---------------------------------------------------------------------------
// Preview (server-rendered with the same pipeline as the public site)
// ---------------------------------------------------------------------------
const preview = ref<{
  html: string;
  readingMinutes: number;
  errors: string[];
  warnings: string[];
} | null>(null);
let previewTimer: ReturnType<typeof setTimeout> | undefined;

async function refreshPreview() {
  const parsed = postFormSchema.safeParse(values.value);
  if (!parsed.success) return;
  const { data, error } = await actions.posts.preview({ values: parsed.data });
  if (!error) preview.value = data;
}

// ---------------------------------------------------------------------------
// Saving: autosave for drafts, explicit saves for anything public.
// ---------------------------------------------------------------------------
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

function validate(): PostFormValues | null {
  const parsed = postFormSchema.safeParse(values.value);
  if (parsed.success) {
    errors.value = {};
    return parsed.data;
  }
  errors.value = fieldErrors(parsed.error);
  return null;
}

async function save(manual: boolean) {
  const parsed = validate();
  if (!parsed) {
    if (manual) focusSummary.value += 1;
    return;
  }
  clearTimeout(autosaveTimer);
  saveState.value = 'saving';
  const { data, error } = await actions.posts.save({ id: props.postId, values: parsed, manual });
  if (error) {
    saveState.value = 'failed';
    serverErrors.value = [error.message];
    live.value = `Not saved: ${error.message}`;
    return;
  }
  serverErrors.value = [];
  previousSlugs.value = data.previousSlugs;
  saveState.value = 'saved';
  localStorage.removeItem(storageKey);
  live.value = manual ? 'Saved.' : 'Draft saved automatically.';
  if (manual) deployMessage.value = triggerMessage(data.deploy) ?? '';
}

watch(
  values,
  () => {
    saveState.value = 'unsaved';
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ values: values.value, savedAt: new Date().toISOString() }),
      );
    } catch {
      // Storage full or disabled: the server copy is still the source of truth.
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 800);
    clearTimeout(autosaveTimer);
    if (status.value === 'draft') autosaveTimer = setTimeout(() => void save(false), 3000);
  },
  { deep: true },
);

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (saveState.value === 'unsaved' || saveState.value === 'saving') event.preventDefault();
}

onMounted(() => {
  void refreshPreview();
  window.addEventListener('beforeunload', warnBeforeLeaving);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const stored = JSON.parse(raw) as { values: unknown; savedAt: string };
    const parsed = postFormSchema.safeParse(stored.values);
    const differs =
      parsed.success && JSON.stringify(parsed.data) !== JSON.stringify(props.initialValues);
    if (parsed.success && differs && Date.parse(stored.savedAt) > Date.parse(props.updatedAt)) {
      restoreOffer.value = { values: parsed.data, savedAt: stored.savedAt };
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeLeaving);
  [slugTimer, previewTimer, autosaveTimer].forEach((timer) => clearTimeout(timer));
});

function acceptRestore() {
  if (restoreOffer.value) values.value = restoreOffer.value.values;
  restoreOffer.value = null;
  live.value = 'Unsaved changes restored.';
}

function discardRestore() {
  localStorage.removeItem(storageKey);
  restoreOffer.value = null;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------
async function publish(publishAt: string | null) {
  const parsed = validate();
  if (!parsed) {
    focusSummary.value += 1;
    return;
  }
  clearTimeout(autosaveTimer);
  saveState.value = 'saving';
  const { data, error } = await actions.posts.publish({
    id: props.postId,
    values: parsed,
    publishAt,
  });
  if (error) {
    saveState.value = 'failed';
    serverErrors.value = error.message.split('\n');
    live.value = 'The post was not published. See the problems listed above the buttons.';
    return;
  }
  serverErrors.value = [];
  saveState.value = 'saved';
  localStorage.removeItem(storageKey);
  publishedAt.value = data.publishedAt;
  previousSlugs.value = data.previousSlugs;
  status.value =
    data.publishedAt && Date.parse(data.publishedAt) > Date.now() ? 'scheduled' : 'published';
  live.value = status.value === 'scheduled' ? 'Post scheduled.' : 'Post published.';
  deployMessage.value =
    triggerMessage(data.deploy) ??
    (status.value === 'scheduled'
      ? 'It appears on the public site with the first daily build after that time.'
      : '');
}

function schedule() {
  if (!scheduleAt.value) {
    serverErrors.value = ['Choose a date and time to schedule the post.'];
    return;
  }
  // datetime-local has no zone: interpret it in the author's local time zone.
  void publish(new Date(scheduleAt.value).toISOString());
}

async function changeStatus(action: 'unpublish' | 'archive') {
  const { data, error } = await actions.posts[action]({ id: props.postId });
  if (error) {
    serverErrors.value = [error.message];
    return;
  }
  status.value = data.status === 'archived' ? 'archived' : 'draft';
  if (action === 'unpublish') publishedAt.value = null;
  live.value = action === 'unpublish' ? 'Post unpublished; it is a draft again.' : 'Post archived.';
  deployMessage.value = triggerMessage(data.deploy) ?? '';
}

const publishedLabel = computed(() =>
  publishedAt.value
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' }).format(
        new Date(publishedAt.value),
      )
    : '',
);

// ---------------------------------------------------------------------------
// Markdown toolbar on a plain <textarea> (accessible, CSP-friendly)
// ---------------------------------------------------------------------------
const body = ref<HTMLTextAreaElement | null>(null);

async function replaceSelection(
  transform: (selected: string) => { text: string; select?: [number, number] },
) {
  const el = body.value;
  if (!el) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const { text, select } = transform(value.slice(start, end));
  values.value.bodyMd = value.slice(0, start) + text + value.slice(end);
  await nextTick();
  el.focus();
  const [from, to] = select ?? [text.length, text.length];
  el.setSelectionRange(start + from, start + to);
}

const wrap = (marker: string, placeholder: string) =>
  replaceSelection((selected) => {
    const inner = selected || placeholder;
    return {
      text: `${marker}${inner}${marker}`,
      select: [marker.length, marker.length + inner.length],
    };
  });

const prefixLines = (prefix: (index: number) => string) =>
  replaceSelection((selected) => {
    const text = (selected || 'Text')
      .split('\n')
      .map((line, index) => `${prefix(index)}${line}`)
      .join('\n');
    return { text };
  });

const toolbar = [
  { label: 'Bold', shortcut: 'Ctrl+B', run: () => wrap('**', 'bold text') },
  { label: 'Italic', shortcut: 'Ctrl+I', run: () => wrap('_', 'italic text') },
  { label: 'Heading', run: () => prefixLines(() => '## ') },
  {
    label: 'Link',
    shortcut: 'Ctrl+K',
    run: () =>
      replaceSelection((selected) => {
        const label = selected || 'link text';
        return { text: `[${label}](https://)`, select: [label.length + 3, label.length + 11] };
      }),
  },
  { label: 'Bulleted list', run: () => prefixLines(() => '- ') },
  { label: 'Numbered list', run: () => prefixLines((index) => `${index + 1}. `) },
  { label: 'Quote', run: () => prefixLines(() => '> ') },
  { label: 'Code', run: () => wrap('`', 'code') },
];

function onBodyKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  const action =
    key === 'b' ? toolbar[0] : key === 'i' ? toolbar[1] : key === 'k' ? toolbar[3] : undefined;
  if (action) {
    event.preventDefault();
    void action.run();
  }
}

// ---------------------------------------------------------------------------
// Images: inline, cover and gallery
// ---------------------------------------------------------------------------
const inlinePicker = ref<InstanceType<typeof ImagePicker> | null>(null);
const coverPicker = ref<InstanceType<typeof ImagePicker> | null>(null);
const galleryPicker = ref<InstanceType<typeof ImagePicker> | null>(null);

function insertImages(ids: string[]) {
  void replaceSelection(() => ({ text: ids.map((id) => `\n\n![](image:${id})\n\n`).join('') }));
  live.value = `Inserted ${ids.length} image reference(s). Alt text comes from the image unless you write one between the brackets.`;
}

function setCover(ids: string[]) {
  values.value.coverImageId = ids[0] ?? null;
  live.value = 'Cover image set.';
}

function addToGallery(ids: string[]) {
  const existing = new Set(values.value.galleryImageIds);
  values.value.galleryImageIds.push(...ids.filter((id) => !existing.has(id)));
  live.value = `Added ${ids.length} image(s) to the gallery.`;
}

function moveGalleryItem(index: number, direction: -1 | 1) {
  values.value.galleryImageIds = move(values.value.galleryImageIds, index, direction);
  const name =
    imageById.value.get(values.value.galleryImageIds[index + direction] ?? '')?.seoName ?? 'Image';
  live.value = `${name} moved to position ${index + direction + 1} of ${values.value.galleryImageIds.length}.`;
}

function removeFromGallery(index: number) {
  const [removed] = values.value.galleryImageIds.splice(index, 1);
  live.value = `${imageById.value.get(removed ?? '')?.seoName ?? 'Image'} removed from the gallery.`;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
const newTag = ref({ en: '', es: '' });
const tagMessage = ref('');

async function createTag() {
  const { data, error } = await actions.tags.create(newTag.value);
  if (error) {
    tagMessage.value = error.message;
    return;
  }
  tags.value.push(data);
  values.value.tagIds.push(data.id);
  newTag.value = { en: '', es: '' };
  tagMessage.value = `Tag “${data.labels.en ?? data.labels.es}” created and selected.`;
}

// ---------------------------------------------------------------------------
// Search result preview
// ---------------------------------------------------------------------------
const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const serpTitle = computed(() =>
  truncate(values.value.title || '(no title)', props.titleRecommended),
);
const serpDescription = computed(() =>
  truncate(values.value.description || '(no description)', props.descriptionRecommended),
);
const path = computed(() => publicPath(values.value.lang, values.value.slug));

const saveLabel = computed(
  () =>
    ({
      saved: 'All changes saved.',
      unsaved:
        status.value === 'draft' ? 'Unsaved changes (saving automatically)…' : 'Unsaved changes.',
      saving: 'Saving…',
      failed: 'Not saved.',
    })[saveState.value],
);
</script>

<template>
  <p class="visually-hidden" role="status" aria-live="polite">{{ live }}</p>

  <div v-if="restoreOffer" class="warning" role="region" aria-labelledby="restore-heading">
    <h2 id="restore-heading">Unsaved changes found</h2>
    <p>
      This browser kept changes from
      <time :datetime="restoreOffer.savedAt">{{
        new Date(restoreOffer.savedAt).toLocaleString('en-GB')
      }}</time>
      that were never saved.
    </p>
    <button type="button" @click="acceptRestore">Restore them</button>
    <button type="button" @click="discardRestore">Discard them</button>
  </div>

  <form novalidate @submit.prevent="save(true)">
    <ErrorSummary :errors="errors" :field-id="fieldId" :focus-signal="focusSummary" />

    <section aria-labelledby="basics-heading">
      <h2 id="basics-heading">Title and address</h2>
      <label :for="fieldId('lang')">Language</label>
      <select :id="fieldId('lang')" v-model="values.lang">
        <option value="en">English</option>
        <option value="es">Spanish</option>
      </select>
      <TextField
        :id="fieldId('title')"
        v-model="values.title"
        label="Title"
        :lang="values.lang"
        :recommended-length="titleRecommended"
        :error="errors.title"
      />
      <TextField
        :id="fieldId('slug')"
        v-model="values.slug"
        label="Address (slug)"
        :hint="`Public address: ${path}`"
        :error="errors.slug"
        @update:model-value="slugFollowsTitle = false"
      />
      <p class="hint" aria-live="polite">{{ slugStatus }}</p>
      <p v-if="previousSlugs.length > 0" class="hint">
        Old addresses that still redirect here: {{ previousSlugs.join(', ') }}
      </p>
    </section>

    <section aria-labelledby="seo-heading">
      <h2 id="seo-heading">Description and search preview</h2>
      <TextField
        :id="fieldId('description')"
        v-model="values.description"
        label="Description"
        hint="Shown in search results and when the link is shared."
        multiline
        :lang="values.lang"
        :recommended-length="descriptionRecommended"
        :error="errors.description"
      />
      <figure class="serp" aria-labelledby="serp-caption">
        <figcaption id="serp-caption" class="hint">How the post may look in Google</figcaption>
        <p class="serp-path">… {{ path }}</p>
        <p class="serp-title" :lang="values.lang">{{ serpTitle }}</p>
        <p class="serp-description" :lang="values.lang">{{ serpDescription }}</p>
      </figure>
    </section>

    <section aria-labelledby="body-heading">
      <h2 id="body-heading">Body</h2>
      <div role="group" aria-label="Formatting" class="step-nav">
        <button
          v-for="tool in toolbar"
          :key="tool.label"
          type="button"
          :aria-keyshortcuts="tool.shortcut?.replace('Ctrl', 'Control')"
          @click="tool.run"
        >
          {{ tool.label }}<span v-if="tool.shortcut" class="hint"> ({{ tool.shortcut }})</span>
        </button>
        <button type="button" @click="inlinePicker?.open()">Insert image</button>
      </div>
      <label :for="fieldId('bodyMd')">Post body (Markdown)</label>
      <span :id="`${fieldId('bodyMd')}-hint`" class="hint">
        Headings start at “##”. Images are inserted as ![optional alt](image:id).
      </span>
      <textarea
        :id="fieldId('bodyMd')"
        ref="body"
        v-model="values.bodyMd"
        rows="20"
        :lang="values.lang"
        spellcheck="true"
        :aria-describedby="`${fieldId('bodyMd')}-hint`"
        :aria-invalid="errors.bodyMd ? 'true' : undefined"
        @keydown="onBodyKeydown"
      />
      <p v-if="errors.bodyMd" class="error">{{ errors.bodyMd }}</p>
    </section>

    <section aria-labelledby="images-heading">
      <h2 id="images-heading">Cover and gallery</h2>
      <h3>Cover image</h3>
      <p v-if="!values.coverImageId">
        No cover image. Link previews will use the site's default image.
      </p>
      <figure v-else-if="imageById.get(values.coverImageId)">
        <img
          :src="imageById.get(values.coverImageId)?.thumbUrl"
          :alt="imageById.get(values.coverImageId)?.alt[values.lang] ?? ''"
          :width="imageById.get(values.coverImageId)?.thumbWidth"
          :height="imageById.get(values.coverImageId)?.thumbHeight"
        />
        <figcaption>{{ imageById.get(values.coverImageId)?.seoName }}</figcaption>
      </figure>
      <p class="step-nav">
        <button type="button" @click="coverPicker?.open()">
          {{ values.coverImageId ? 'Change cover' : 'Choose cover' }}
        </button>
        <button v-if="values.coverImageId" type="button" @click="values.coverImageId = null">
          Remove cover
        </button>
      </p>

      <h3>Gallery</h3>
      <p v-if="values.galleryImageIds.length === 0">No gallery.</p>
      <ol v-else class="gallery-list">
        <li v-for="(id, index) in values.galleryImageIds" :key="id">
          <img
            :src="imageById.get(id)?.thumbUrl"
            alt=""
            :width="imageById.get(id)?.thumbWidth"
            :height="imageById.get(id)?.thumbHeight"
            class="gallery-thumb"
          />
          <span>{{ imageById.get(id)?.seoName ?? 'Missing image' }}</span>
          <button type="button" :disabled="index === 0" @click="moveGalleryItem(index, -1)">
            Move up<span class="visually-hidden"> {{ imageById.get(id)?.seoName }}</span>
          </button>
          <button
            type="button"
            :disabled="index === values.galleryImageIds.length - 1"
            @click="moveGalleryItem(index, 1)"
          >
            Move down<span class="visually-hidden"> {{ imageById.get(id)?.seoName }}</span>
          </button>
          <button type="button" @click="removeFromGallery(index)">
            Remove<span class="visually-hidden"> {{ imageById.get(id)?.seoName }}</span>
          </button>
        </li>
      </ol>
      <p><button type="button" @click="galleryPicker?.open()">Add images to the gallery</button></p>
    </section>

    <section aria-labelledby="tags-heading">
      <h2 id="tags-heading">Tags and translation</h2>
      <fieldset>
        <legend>Tags</legend>
        <p v-if="tags.length === 0" class="hint">No tags yet.</p>
        <ul class="plain">
          <li v-for="tag in tags" :key="tag.id">
            <input :id="`tag-${tag.id}`" v-model="values.tagIds" type="checkbox" :value="tag.id" />
            <label :for="`tag-${tag.id}`">{{
              tag.labels[values.lang] ?? tag.labels.en ?? tag.labels.es ?? tag.slug
            }}</label>
          </li>
        </ul>
        <details>
          <summary>Create a tag</summary>
          <label for="new-tag-en">Name in English</label>
          <input id="new-tag-en" v-model="newTag.en" type="text" lang="en" />
          <label for="new-tag-es">Name in Spanish</label>
          <input id="new-tag-es" v-model="newTag.es" type="text" lang="es" />
          <button type="button" @click="createTag">Create and select</button>
          <p aria-live="polite">{{ tagMessage }}</p>
        </details>
      </fieldset>

      <label :for="fieldId('translationOf')">This post is a translation of</label>
      <span :id="`${fieldId('translationOf')}-hint`" class="hint">
        Linked translations tell search engines which version to show to each language.
      </span>
      <select
        :id="fieldId('translationOf')"
        v-model="values.translationOf"
        :aria-describedby="`${fieldId('translationOf')}-hint`"
      >
        <option :value="null">No translation</option>
        <option v-for="option in translationOptions" :key="option.id" :value="option.id">
          {{ option.title }} ({{ option.lang }})
        </option>
      </select>
    </section>

    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">Preview</h2>
      <p v-if="preview" class="hint">About {{ preview.readingMinutes }} min read.</p>
      <div v-if="preview && preview.errors.length > 0" class="error-summary">
        <h3>Needed before publishing</h3>
        <ul>
          <li v-for="problem in preview.errors" :key="problem">{{ problem }}</li>
        </ul>
      </div>
      <div v-if="preview && preview.warnings.length > 0" class="warning">
        <h3>Worth checking</h3>
        <ul>
          <li v-for="warning in preview.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
      <!-- Server-rendered with the public pipeline: sanitized, raw HTML is never allowed. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article class="preview" :lang="values.lang" v-html="preview?.html ?? ''" />
    </section>

    <section aria-labelledby="publish-heading">
      <h2 id="publish-heading">Publishing</h2>
      <p>
        Status: <strong>{{ status }}</strong>
        <template v-if="publishedAt && status !== 'draft'">
          — {{ status === 'scheduled' ? 'goes live on' : 'since' }}
          <time :datetime="publishedAt">{{ publishedLabel }}</time>
        </template>
      </p>
      <p role="status">{{ saveLabel }}</p>
      <p role="status">{{ deployMessage }}</p>
      <div v-if="serverErrors.length > 0" role="alert" class="error-summary">
        <ul>
          <li v-for="message in serverErrors" :key="message">{{ message }}</li>
        </ul>
      </div>

      <div class="step-nav">
        <template v-if="status === 'draft' || status === 'archived'">
          <button type="submit">Save {{ status === 'draft' ? 'draft' : '' }}</button>
          <button type="button" @click="publish(null)">Publish now</button>
        </template>
        <template v-else>
          <button type="button" @click="publish(status === 'scheduled' ? publishedAt : null)">
            Update {{ status }} post
          </button>
          <button type="button" @click="changeStatus('unpublish')">Unpublish</button>
          <button v-if="status === 'published'" type="button" @click="changeStatus('archive')">
            Archive
          </button>
        </template>
      </div>

      <fieldset v-if="status !== 'published'">
        <legend>Schedule</legend>
        <label for="schedule-at">Publish automatically on (your local time)</label>
        <input id="schedule-at" v-model="scheduleAt" type="datetime-local" />
        <button type="button" @click="schedule">Schedule</button>
      </fieldset>
    </section>
  </form>

  <RevisionHistory :revisions="revisions" :current="values" />

  <ImagePicker
    ref="inlinePicker"
    :images="images"
    :lang="values.lang"
    heading="Insert images into the body"
    confirm-label="Insert"
    multiple
    @select="insertImages"
  />
  <ImagePicker
    ref="coverPicker"
    :images="images"
    :lang="values.lang"
    heading="Choose the cover image"
    confirm-label="Use as cover"
    @select="setCover"
  />
  <ImagePicker
    ref="galleryPicker"
    :images="images"
    :lang="values.lang"
    heading="Add images to the gallery"
    confirm-label="Add to gallery"
    multiple
    @select="addToGallery"
  />
</template>
