import { afterEach, describe, expect, it } from 'vitest';
import { adminDb, uniqueSlug } from '../test/local-stack.ts';
import {
  createImage,
  deleteImage,
  findImageReferences,
  ImageInUseError,
  isSeoNameAvailable,
  updateImage,
} from './admin/images.ts';
import {
  createPost,
  deletePost,
  getPost,
  isPostSlugAvailable,
  listPosts,
  type PostInput,
  setPostTags,
  syncPostImages,
  updatePost,
} from './admin/posts.ts';
import { getRevision, listRevisions, recordRevision } from './admin/revisions.ts';
import { createTag, deleteTag } from './admin/tags.ts';
import { ConflictError, DbError } from './errors.ts';

const db = adminDb();

// Everything created here is cleaned up so reruns start from the seed state. Posts go first:
// images and tags they reference cannot be deleted while the links exist.
const cleanup = { posts: [] as string[], rest: [] as (() => PromiseLike<unknown>)[] };
afterEach(async () => {
  for (const id of cleanup.posts) await deletePost(db, id);
  for (const task of cleanup.rest) await task();
  cleanup.posts = [];
  cleanup.rest = [];
});

async function newPost(overrides: Partial<PostInput> = {}) {
  const post = await createPost(db, { lang: 'en', slug: uniqueSlug('admin'), ...overrides });
  cleanup.posts.push(post.id);
  return post;
}

async function newImage(seoPrefix = 'admin-img') {
  const id = crypto.randomUUID();
  const image = await createImage(db, {
    id,
    seoName: uniqueSlug(seoPrefix),
    originalKey: `originals/${id}.jpg`,
    originalFilename: 'photo.jpg',
    originalMime: 'image/jpeg',
    originalBytes: 10,
    alt: { en: 'A photo', es: 'Una foto' },
  });
  cleanup.rest.push(() => db.from('images').delete().eq('id', id));
  return image;
}

describe('posts', () => {
  it('creates a draft with sensible defaults and reads it back', async () => {
    const post = await newPost({ title: 'Draft' });
    expect(post.status).toBe('draft');
    expect(post.publishedAt).toBeNull();
    expect(post.tagIds).toEqual([]);
    expect(await getPost(db, post.id)).toEqual(post);
  });

  it('updates fields and bumps updated_at', async () => {
    const post = await newPost();
    const updated = await updatePost(db, post.id, { title: 'New title', bodyMd: '# Hi' });
    expect(updated.title).toBe('New title');
    expect(updated.bodyMd).toBe('# Hi');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(post.updatedAt).getTime(),
    );
  });

  it('rejects a duplicate slug in the same language with ConflictError', async () => {
    const post = await newPost();
    await expect(createPost(db, { lang: 'en', slug: post.slug })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('allows the same slug in another language', async () => {
    const post = await newPost();
    const spanish = await newPost({ lang: 'es', slug: post.slug });
    expect(spanish.slug).toBe(post.slug);
  });

  it('refuses to publish an incomplete post', async () => {
    const post = await newPost();
    await expect(
      updatePost(db, post.id, { status: 'published', publishedAt: new Date().toISOString() }),
    ).rejects.toBeInstanceOf(DbError);
  });

  it('treats current and previous slugs as taken', async () => {
    const post = await newPost();
    const oldSlug = post.slug;
    const newSlug = uniqueSlug('renamed');
    await updatePost(db, post.id, { slug: newSlug, previousSlugs: [oldSlug] });

    expect(await isPostSlugAvailable(db, 'en', newSlug)).toBe(false);
    expect(await isPostSlugAvailable(db, 'en', oldSlug)).toBe(false);
    // The post itself may move back to one of its old slugs.
    expect(await isPostSlugAvailable(db, 'en', oldSlug, post.id)).toBe(true);
    expect(await isPostSlugAvailable(db, 'es', newSlug)).toBe(true);
  });

  it('rejects invalid slugs without querying with them', async () => {
    expect(await isPostSlugAvailable(db, 'en', 'x,slug.eq.y')).toBe(false);
  });

  it('filters the list by status and language', async () => {
    const post = await newPost({ lang: 'es' });
    const drafts = await listPosts(db, { status: 'draft', lang: 'es' });
    expect(drafts.map((p) => p.id)).toContain(post.id);
    expect(drafts.every((p) => p.status === 'draft' && p.lang === 'es')).toBe(true);
  });

  it('allows only one post per language in a translation group', async () => {
    const translationKey = crypto.randomUUID();
    await newPost({ translationKey });
    await newPost({ lang: 'es', translationKey });
    await expect(
      createPost(db, { lang: 'en', slug: uniqueSlug('dup'), translationKey }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('tags and images of a post', () => {
  it('replaces tags transactionally', async () => {
    const post = await newPost();
    const a = await createTag(db, { slug: uniqueSlug('tag-a'), labels: { en: 'A' } });
    const b = await createTag(db, { slug: uniqueSlug('tag-b'), labels: { en: 'B' } });
    cleanup.rest.push(
      () => deleteTag(db, a.id),
      () => deleteTag(db, b.id),
    );

    await setPostTags(db, post.id, [a.id, b.id]);
    await setPostTags(db, post.id, [b.id]);
    expect((await getPost(db, post.id))?.tagIds).toEqual([b.id]);
  });

  it('keeps gallery order and separates inline references', async () => {
    const post = await newPost();
    const [one, two, three] = [await newImage(), await newImage(), await newImage()];
    await syncPostImages(db, post.id, { gallery: [three.id, one.id], inline: [two.id] });

    const stored = await getPost(db, post.id);
    expect(stored?.galleryImageIds).toEqual([three.id, one.id]);
    expect(stored?.inlineImageIds).toEqual([two.id]);
  });

  it('refuses to delete an image that a post uses, explaining where', async () => {
    const image = await newImage();
    const post = await newPost({ coverImageId: image.id });

    const references = await findImageReferences(db, image.id);
    expect(references.coverOf).toEqual([post.id]);
    await expect(deleteImage(db, image.id)).rejects.toBeInstanceOf(ImageInUseError);

    await updatePost(db, post.id, { coverImageId: null });
    await expect(deleteImage(db, image.id)).resolves.toBeUndefined();
  });

  it('validates the SEO name and its uniqueness', async () => {
    const image = await newImage('seo-check');
    expect(await isSeoNameAvailable(db, image.seoName)).toBe(false);
    expect(await isSeoNameAvailable(db, image.seoName, image.id)).toBe(true);
    expect(await isSeoNameAvailable(db, 'Not Valid')).toBe(false);
  });

  it('only marks an image ready when it is complete', async () => {
    const image = await newImage();
    await expect(updateImage(db, image.id, { status: 'ready' })).rejects.toBeInstanceOf(DbError);
  });
});

describe('revisions', () => {
  it('keeps only the newest 50 per entity', async () => {
    const entityId = crypto.randomUUID();
    cleanup.rest.push(() => db.from('revisions').delete().eq('entity_id', entityId));

    for (let i = 0; i < 55; i += 1) {
      await recordRevision(db, 'post', entityId, { version: i });
    }
    const revisions = await listRevisions(db, 'post', entityId);
    expect(revisions).toHaveLength(50);

    const newest = await getRevision(db, revisions[0]?.id ?? '');
    expect(newest?.snapshot).toEqual({ version: 54 });
  });
});
