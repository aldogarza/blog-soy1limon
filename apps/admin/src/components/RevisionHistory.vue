<script setup lang="ts">
import { actions } from 'astro:actions';
import { diffLines } from 'diff';
import { ref } from 'vue';
import type { PostFormValues } from '../lib/post-form.ts';

const props = defineProps<{
  revisions: { id: string; createdAt: string }[];
  current: PostFormValues;
}>();

interface Comparison {
  revisionId: string;
  fields: { label: string; before: string; after: string }[];
  parts: { added: boolean; removed: boolean; value: string }[];
}

const comparison = ref<Comparison | null>(null);
const message = ref('');
const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });

async function compare(revisionId: string) {
  const { data, error } = await actions.posts.revision({ revisionId });
  if (error) {
    message.value = error.message;
    return;
  }
  const fields = (['title', 'slug', 'description'] as const)
    .filter((key) => data[key] !== props.current[key])
    .map((key) => ({ label: key, before: data[key], after: props.current[key] }));
  const parts = diffLines(data.bodyMd, props.current.bodyMd).map((part) => ({
    added: Boolean(part.added),
    removed: Boolean(part.removed),
    value: part.value,
  }));
  comparison.value = { revisionId, fields, parts };
  message.value = 'Comparison shown below the list.';
}

async function restore(revisionId: string) {
  message.value = 'Restoring…';
  const { error } = await actions.posts.restoreRevision({ revisionId });
  if (error) {
    message.value = error.message;
    return;
  }
  window.location.reload();
}
</script>

<template>
  <section aria-labelledby="history-heading">
    <h2 id="history-heading">History</h2>
    <p v-if="revisions.length === 0">
      No saved versions yet. Each manual save, publish or restore adds one.
    </p>
    <ol v-else>
      <li v-for="(revision, index) in revisions" :key="revision.id">
        <time :datetime="revision.createdAt">{{
          format.format(new Date(revision.createdAt))
        }}</time>
        <span v-if="index === 0"> (latest)</span>
        <button type="button" @click="compare(revision.id)">Compare with the editor</button>
        <button v-if="index > 0" type="button" @click="restore(revision.id)">
          Restore this version
        </button>
      </li>
    </ol>
    <p aria-live="polite" role="status">{{ message }}</p>

    <div v-if="comparison" class="comparison">
      <h3>Changes since that version</h3>
      <dl v-if="comparison.fields.length > 0">
        <template v-for="field in comparison.fields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd>
            <del><span class="visually-hidden">Removed: </span>{{ field.before }}</del>
            → <ins><span class="visually-hidden">Added: </span>{{ field.after }}</ins>
          </dd>
        </template>
      </dl>
      <h4>Body</h4>
      <pre
        class="diff"
      ><template v-for="(part, i) in comparison.parts" :key="i"><ins v-if="part.added"><span class="visually-hidden">Added: </span>{{ part.value }}</ins><del v-else-if="part.removed"><span class="visually-hidden">Removed: </span>{{ part.value }}</del><span v-else>{{ part.value }}</span></template></pre>
    </div>
  </section>
</template>
