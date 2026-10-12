import { type Locale, slugify } from '@soy1limon/core';
import {
  createPost,
  deletePost,
  getPost,
  getRevision,
  isPostSlugAvailable,
  type JsonObject,
  linkTranslation,
  listImages,
  listTranslations,
  type PostRecord,
  recordRevision,
  setPostTags,
  syncPostImages,
  unlinkTranslation,
  updatePost,
} from '@soy1limon/db/admin';
import {
  extractImageIds,
  type ImageForRender,
  type RenderResult,
  renderMarkdown,
} from '@soy1limon/markdown';
import {
  nextPreviousSlugs,
  type PostFormValues,
  postFormSchema,
  valuesFromPost,
} from '../post-form.ts';
import { checkPublishable, type PublishCheck } from '../post-validation.ts';
import { adminEnv } from './env.ts';
import { getDb } from './services.ts';

export class PublishValidationError extends Error {
  override name = 'PublishValidationError';
  readonly check: PublishCheck;

  constructor(check: PublishCheck) {
    super(`The post cannot be published yet: ${check.errors.join(' ')}`);
    this.check = check;
  }
}

/** Ready images keyed by id, in the shape the Markdown renderer needs. */
export async function renderableImages(): Promise<Map<string, ImageForRender>> {
  const images = await listImages(getDb(), { status: 'ready' });
  return new Map(
    images
      .filter((image) => image.width !== null && image.height !== null)
      .map((image) => [
        image.id,
        {
          id: image.id,
          seoName: image.seoName,
          width: image.width ?? 0,
          height: image.height ?? 0,
          variants: image.variants,
          alt: image.alt,
          caption: image.caption,
        },
      ]),
  );
}

export async function renderPreview(
  values: Pick<PostFormValues, 'bodyMd' | 'lang'>,
  images?: Map<string, ImageForRender>,
): Promise<RenderResult> {
  return renderMarkdown(values.bodyMd, {
    lang: values.lang,
    images: images ?? (await renderableImages()),
    mediaBaseUrl: adminEnv().MEDIA_BASE_URL,
  });
}

/** Creates an empty draft with a unique slug derived from the title. */
export async function createDraft(lang: Locale, title: string): Promise<PostRecord> {
  const db = getDb();
  const base = slugify(title) || 'untitled';
  let slug = base;
  for (let n = 2; !(await isPostSlugAvailable(db, lang, slug)); n += 1) slug = `${base}-${n}`;
  return createPost(db, { lang, title: title.trim(), slug });
}

export async function translationOf(post: PostRecord): Promise<string | null> {
  const [first] = await listTranslations(getDb(), post);
  return first?.id ?? null;
}

/**
 * Saves the editor state. Manual saves record a revision; autosaves (drafts only) do not, so the
 * history keeps meaningful versions instead of every keystroke pause.
 */
export async function savePost(
  id: string,
  rawValues: PostFormValues,
  options: { manual: boolean },
): Promise<PostRecord> {
  const values = postFormSchema.parse(rawValues);
  const db = getDb();
  const current = await getPost(db, id);
  if (!current) throw new Error('This post no longer exists.');
  if (!options.manual && current.status !== 'draft') {
    // A published post must never change behind the author's back: the next build would publish it.
    throw new Error('Autosave only applies to drafts. Save published posts explicitly.');
  }
  if (!(await isPostSlugAvailable(db, values.lang, values.slug, id))) {
    throw new Error(
      `Another ${values.lang === 'en' ? 'English' : 'Spanish'} post already uses “${values.slug}” (now or as an old address).`,
    );
  }

  await updatePost(db, id, {
    lang: values.lang,
    title: values.title,
    slug: values.slug,
    description: values.description,
    bodyMd: values.bodyMd,
    coverImageId: values.coverImageId,
    previousSlugs: nextPreviousSlugs(current, values.slug),
  });
  await setPostTags(db, id, values.tagIds);
  await syncPostImages(db, id, {
    gallery: values.galleryImageIds,
    inline: extractImageIds(values.bodyMd),
  });

  const currentCounterpart = await translationOf(current);
  if (values.translationOf !== currentCounterpart) {
    if (values.translationOf) await linkTranslation(db, id, values.translationOf);
    else await unlinkTranslation(db, id);
  }

  if (options.manual) await recordRevision(db, 'post', id, { values } as JsonObject);
  const saved = await getPost(db, id);
  if (!saved) throw new Error('This post no longer exists.');
  return saved;
}

/** Validates everything a public post needs; returns errors and warnings without changing anything. */
export async function checkPost(values: PostFormValues): Promise<PublishCheck> {
  const images = await renderableImages();
  const rendered = await renderPreview(values, images);
  return checkPublishable(values, rendered.problems, images);
}

/**
 * Saves and publishes. `publishAt` in the future schedules the post: it stays hidden from the
 * public build until then. Republishing an already public post keeps its original date.
 */
export async function publishPost(
  id: string,
  values: PostFormValues,
  publishAt: string | null,
): Promise<PostRecord> {
  const check = await checkPost(postFormSchema.parse(values));
  if (check.errors.length > 0) throw new PublishValidationError(check);
  const saved = await savePost(id, values, { manual: true });
  const alreadyPublic =
    saved.status === 'published' &&
    saved.publishedAt !== null &&
    Date.parse(saved.publishedAt) <= Date.now();
  const date = publishAt ?? (alreadyPublic ? saved.publishedAt : null) ?? new Date().toISOString();
  return updatePost(getDb(), id, { status: 'published', publishedAt: date });
}

export async function unpublishPost(id: string): Promise<PostRecord> {
  return updatePost(getDb(), id, { status: 'draft', publishedAt: null });
}

export async function archivePost(id: string): Promise<PostRecord> {
  return updatePost(getDb(), id, { status: 'archived' });
}

export async function removePost(id: string): Promise<void> {
  const db = getDb();
  await deletePost(db, id);
  await db.from('revisions').delete().eq('entity_type', 'post').eq('entity_id', id);
}

export async function revisionValues(
  revisionId: string,
): Promise<{ postId: string; values: PostFormValues }> {
  const revision = await getRevision(getDb(), revisionId);
  if (!revision || revision.entityType !== 'post') throw new Error('Revision not found.');
  return { postId: revision.entityId, values: postFormSchema.parse(revision.snapshot.values) };
}

/** Puts an older version back in the editor state and saves it as a new revision. */
export async function restorePostRevision(revisionId: string): Promise<PostRecord> {
  const { postId, values } = await revisionValues(revisionId);
  const current = await getPost(getDb(), postId);
  if (!current) throw new Error('This post no longer exists.');
  // Keep the current translation link: it is a relation between posts, not part of this post's text.
  return savePost(
    postId,
    { ...values, translationOf: await translationOf(current) },
    { manual: true },
  );
}

export { valuesFromPost };
