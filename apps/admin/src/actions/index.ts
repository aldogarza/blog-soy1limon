import { ConflictError } from '@soy1limon/db';
import { LOCALES, slugify } from '@soy1limon/core';
import {
  createTag,
  getImage,
  getPost,
  ImageInUseError,
  isPostSlugAvailable,
  isSeoNameAvailable,
} from '@soy1limon/db/admin';
import { UnsupportedImageError } from '@soy1limon/media';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { imageFormSchema } from '../lib/image-form.ts';
import { postFormSchema } from '../lib/post-form.ts';
import {
  cleanupRetired,
  createFromStaging,
  discardUpload,
  inspectUpload,
  removeImage,
  restoreRevision,
  updateFromForm,
} from '../lib/server/media-service.ts';
import {
  archivePost,
  checkPost,
  createDraft,
  publishPost,
  PublishValidationError,
  removePost,
  renderPreview,
  restorePostRevision,
  revisionValues,
  savePost,
  unpublishPost,
} from '../lib/server/post-service.ts';
import {
  assertRetiredFilesUnused,
  isImageLive,
  rebuildIfLive,
  requestRebuild,
} from '../lib/server/deploy-service.ts';
import { getDb } from '../lib/server/services.ts';

/** Turns known failures into messages the form can show; everything else is a 500 with its text. */
function toActionError(error: unknown): ActionError {
  if (error instanceof ActionError) return error;
  if (error instanceof UnsupportedImageError) {
    return new ActionError({ code: 'BAD_REQUEST', message: error.message });
  }
  if (error instanceof ImageInUseError) {
    const posts =
      error.references.coverOf.length +
      error.references.gallery.length +
      error.references.inline.length;
    return new ActionError({
      code: 'CONFLICT',
      message: `This image is used by ${posts} post reference(s). Remove it from those posts first.`,
    });
  }
  if (error instanceof PublishValidationError) {
    return new ActionError({ code: 'BAD_REQUEST', message: error.check.errors.join('\n') });
  }
  if (error instanceof ConflictError) {
    return new ActionError({ code: 'CONFLICT', message: 'That name is already taken.' });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(error);
  return new ActionError({ code: 'INTERNAL_SERVER_ERROR', message });
}

async function run<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw toActionError(error);
  }
}

/** Image edits change the files and HTML of every post that shows the image. */
async function rebuildIfImageLive(id: string) {
  return (await isImageLive(id)) ? requestRebuild('image') : null;
}

/** Post state just before an edit, to know whether the public site changes. */
const postBefore = (id: string) => getPost(getDb(), id);

export const server = {
  media: {
    inspect: defineAction({
      accept: 'form',
      input: z.object({ file: z.instanceof(File) }),
      handler: ({ file }) => run(() => inspectUpload(file)),
    }),

    discard: defineAction({
      input: z.object({ token: z.uuid() }),
      handler: ({ token }) => run(() => discardUpload(token)),
    }),

    checkSeoName: defineAction({
      input: z.object({ seoName: z.string(), excludeId: z.uuid().optional() }),
      handler: ({ seoName, excludeId }) =>
        run(async () => ({ available: await isSeoNameAvailable(getDb(), seoName, excludeId) })),
    }),

    create: defineAction({
      input: z.object({ token: z.uuid(), values: imageFormSchema }),
      handler: ({ token, values }) =>
        run(async () => {
          const image = await createFromStaging(token, values);
          return { id: image.id, seoName: image.seoName };
        }),
    }),

    update: defineAction({
      input: z.object({ id: z.uuid(), values: imageFormSchema }),
      handler: ({ id, values }) =>
        run(async () => {
          const image = await updateFromForm(id, values);
          return {
            id: image.id,
            seoName: image.seoName,
            deploy: await rebuildIfImageLive(image.id),
          };
        }),
    }),

    delete: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) => run(() => removeImage(id)),
    }),

    cleanupRetired: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) =>
        run(async () => {
          const image = await getImage(getDb(), id);
          if (image) await assertRetiredFilesUnused(image);
          return { deleted: await cleanupRetired(id) };
        }),
    }),

    restoreRevision: defineAction({
      accept: 'form',
      input: z.object({ revisionId: z.uuid() }),
      handler: ({ revisionId }) =>
        run(async () => {
          const image = await restoreRevision(revisionId);
          return { id: image.id, deploy: await rebuildIfImageLive(image.id) };
        }),
    }),
  },

  posts: {
    create: defineAction({
      accept: 'form',
      input: z.object({ lang: z.enum(LOCALES), title: z.string().trim().max(200) }),
      handler: ({ lang, title }) =>
        run(async () => {
          const post = await createDraft(lang, title);
          return { id: post.id };
        }),
    }),

    checkSlug: defineAction({
      input: z.object({ lang: z.enum(LOCALES), slug: z.string(), excludeId: z.uuid() }),
      handler: ({ lang, slug, excludeId }) =>
        run(async () => ({ available: await isPostSlugAvailable(getDb(), lang, slug, excludeId) })),
    }),

    save: defineAction({
      input: z.object({ id: z.uuid(), values: postFormSchema, manual: z.boolean() }),
      handler: ({ id, values, manual }) =>
        run(async () => {
          const post = await savePost(id, values, { manual });
          return {
            updatedAt: post.updatedAt,
            previousSlugs: post.previousSlugs,
            deploy: manual ? await rebuildIfLive('update', post) : null,
          };
        }),
    }),

    preview: defineAction({
      input: z.object({ values: postFormSchema }),
      handler: ({ values }) =>
        run(async () => {
          const [rendered, check] = await Promise.all([renderPreview(values), checkPost(values)]);
          return {
            html: rendered.html,
            headings: rendered.headings,
            readingMinutes: rendered.readingMinutes,
            errors: check.errors,
            warnings: check.warnings,
          };
        }),
    }),

    publish: defineAction({
      input: z.object({
        id: z.uuid(),
        values: postFormSchema,
        publishAt: z.iso.datetime({ offset: true }).nullable(),
      }),
      handler: ({ id, values, publishAt }) =>
        run(async () => {
          const before = await postBefore(id);
          const post = await publishPost(id, values, publishAt);
          return {
            status: post.status,
            publishedAt: post.publishedAt,
            previousSlugs: post.previousSlugs,
            deploy: await rebuildIfLive('publish', before, post),
          };
        }),
    }),

    unpublish: defineAction({
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) =>
        run(async () => {
          const before = await postBefore(id);
          const post = await unpublishPost(id);
          return { status: post.status, deploy: await rebuildIfLive('unpublish', before) };
        }),
    }),

    archive: defineAction({
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) =>
        run(async () => {
          const before = await postBefore(id);
          const post = await archivePost(id);
          return { status: post.status, deploy: await rebuildIfLive('archive', before) };
        }),
    }),

    delete: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) =>
        run(async () => {
          const before = await postBefore(id);
          await removePost(id);
          return { deploy: await rebuildIfLive('delete', before) };
        }),
    }),

    revision: defineAction({
      input: z.object({ revisionId: z.uuid() }),
      handler: ({ revisionId }) => run(async () => (await revisionValues(revisionId)).values),
    }),

    restoreRevision: defineAction({
      input: z.object({ revisionId: z.uuid() }),
      handler: ({ revisionId }) =>
        run(async () => {
          const post = await restorePostRevision(revisionId);
          return { id: post.id, deploy: await rebuildIfLive('update', post) };
        }),
    }),
  },

  site: {
    /** Manual rebuild, e.g. after editing an image or when a deploy failed. */
    rebuild: defineAction({
      accept: 'form',
      handler: () => run(() => requestRebuild('manual')),
    }),
  },

  tags: {
    create: defineAction({
      input: z.object({
        en: z.string().trim().max(60),
        es: z.string().trim().max(60),
      }),
      handler: ({ en, es }) =>
        run(async () => {
          const slug = slugify(en || es);
          if (!slug)
            throw new ActionError({
              code: 'BAD_REQUEST',
              message: 'Write the tag name in at least one language.',
            });
          const tag = await createTag(getDb(), {
            slug,
            labels: { ...(en ? { en } : {}), ...(es ? { es } : {}) },
          });
          return { id: tag.id, slug: tag.slug, labels: tag.labels };
        }),
    }),
  },
};
