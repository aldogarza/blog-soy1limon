import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb, anonDb, uniqueSlug } from '../test/local-stack.ts';
import { createImage, deleteImage, updateImage } from './admin/images.ts';
import { createPost, deletePost, setPostTags, syncPostImages } from './admin/posts.ts';
import { recordRevision } from './admin/revisions.ts';
import { createTag, deleteTag } from './admin/tags.ts';

// What the publishable key (anon role) may see. These tests are the contract behind the public build.

const PERMISSION_DENIED = '42501';

const admin = adminDb();
const anon = anonDb();

const ids = {
  tag: '',
  coverImage: '',
  draftOnlyImage: '',
  processingImage: '',
  published: '',
  draft: '',
  scheduled: '',
};

async function readyImage(seoPrefix: string) {
  const id = crypto.randomUUID();
  await createImage(admin, {
    id,
    seoName: uniqueSlug(seoPrefix),
    originalKey: `originals/${id}.jpg`,
    originalFilename: `${seoPrefix}.jpg`,
    originalMime: 'image/jpeg',
    originalBytes: 1234,
  });
  await updateImage(admin, id, {
    status: 'ready',
    width: 800,
    height: 600,
    variants: [{ w: 800, h: 600, bytes: 1000, key: `images/2026/${seoPrefix}-800.webp` }],
  });
  return id;
}

beforeAll(async () => {
  ids.tag = (await createTag(admin, { slug: uniqueSlug('rls-tag'), labels: { en: 'RLS' } })).id;
  ids.coverImage = await readyImage('rls-cover');
  ids.draftOnlyImage = await readyImage('rls-draft-only');

  const processingId = crypto.randomUUID();
  await createImage(admin, {
    id: processingId,
    seoName: uniqueSlug('rls-processing'),
    originalKey: `originals/${processingId}.jpg`,
    originalFilename: 'processing.jpg',
    originalMime: 'image/jpeg',
    originalBytes: 1,
  });
  ids.processingImage = processingId;

  const base = { lang: 'en' as const, title: 'RLS test', description: 'RLS test post' };
  ids.published = (
    await createPost(admin, {
      ...base,
      slug: uniqueSlug('rls-published'),
      status: 'published',
      publishedAt: new Date(Date.now() - 60_000).toISOString(),
      coverImageId: ids.coverImage,
    })
  ).id;
  ids.draft = (await createPost(admin, { ...base, slug: uniqueSlug('rls-draft') })).id;
  ids.scheduled = (
    await createPost(admin, {
      ...base,
      slug: uniqueSlug('rls-scheduled'),
      status: 'published',
      publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
  ).id;

  await setPostTags(admin, ids.published, [ids.tag]);
  await setPostTags(admin, ids.draft, [ids.tag]);
  // A processing image linked to a published post must still stay hidden.
  await syncPostImages(admin, ids.published, { gallery: [ids.processingImage], inline: [] });
  await syncPostImages(admin, ids.draft, { gallery: [ids.draftOnlyImage], inline: [] });
  await recordRevision(admin, 'post', ids.published, { title: 'old title' });
});

afterAll(async () => {
  for (const id of [ids.published, ids.draft, ids.scheduled]) if (id) await deletePost(admin, id);
  for (const id of [ids.coverImage, ids.draftOnlyImage, ids.processingImage]) {
    if (id) await deleteImage(admin, id);
  }
  if (ids.tag) await deleteTag(admin, ids.tag);
  await admin.from('revisions').delete().eq('entity_id', ids.published);
});

describe('anon can read', () => {
  it('only published posts whose date has passed', async () => {
    const { data, error } = await anon
      .from('posts')
      .select('id')
      .in('id', [ids.published, ids.draft, ids.scheduled]);
    expect(error).toBeNull();
    expect(data?.map((row) => row.id)).toEqual([ids.published]);
  });

  it('tag links of published posts only', async () => {
    const { data } = await anon.from('post_tags').select('post_id').eq('tag_id', ids.tag);
    expect(data?.map((row) => row.post_id)).toEqual([ids.published]);
  });

  it('image links of published posts only', async () => {
    const { data } = await anon
      .from('post_images')
      .select('post_id')
      .in('post_id', [ids.published, ids.draft]);
    expect(data?.map((row) => row.post_id)).toEqual([ids.published]);
  });

  it('only ready images used by published posts', async () => {
    const { data, error } = await anon
      .from('images')
      .select('id')
      .in('id', [ids.coverImage, ids.draftOnlyImage, ids.processingImage]);
    expect(error).toBeNull();
    expect(data?.map((row) => row.id)).toEqual([ids.coverImage]);
  });

  it('every tag (tags are not secret)', async () => {
    const { data } = await anon.from('tags').select('id').eq('id', ids.tag);
    expect(data).toHaveLength(1);
  });
});

describe('anon cannot read', () => {
  it.each(['original_key', 'original_filename', 'retired_keys', 'status', '*'])(
    'the private image column %s',
    async (column) => {
      const { error } = await anon.from('images').select(column).eq('id', ids.coverImage);
      expect(error?.code).toBe(PERMISSION_DENIED);
    },
  );

  it('revisions at all', async () => {
    const { error } = await anon.from('revisions').select('id').limit(1);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });
});

describe('anon cannot write', () => {
  it('inserts posts', async () => {
    const { error } = await anon.from('posts').insert({ lang: 'en', slug: uniqueSlug('anon') });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('updates posts', async () => {
    const { error } = await anon.from('posts').update({ title: 'hacked' }).eq('id', ids.published);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('deletes posts', async () => {
    const { error } = await anon.from('posts').delete().eq('id', ids.published);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('inserts tags', async () => {
    const { error } = await anon.from('tags').insert({ slug: uniqueSlug('anon') });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('calls the admin functions', async () => {
    const { error } = await anon.rpc('set_post_tags', { p_post_id: ids.published, p_tag_ids: [] });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });
});
