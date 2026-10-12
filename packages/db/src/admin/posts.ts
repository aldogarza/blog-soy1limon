import { isSlug, type Locale, type PostStatus } from '@soy1limon/core';
import type { DbClient } from '../clients.ts';
import type { Tables, TablesInsert, TablesUpdate } from '../database.types.ts';
import { DbError, NotFoundError, unwrap } from '../errors.ts';
import { parseLocale, parsePostStatus } from './parse.ts';

export interface PostRecord {
  id: string;
  lang: Locale;
  slug: string;
  title: string;
  description: string;
  bodyMd: string;
  status: PostStatus;
  publishedAt: string | null;
  coverImageId: string | null;
  translationKey: string | null;
  previousSlugs: string[];
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
  galleryImageIds: string[];
  inlineImageIds: string[];
}

export type PostSummary = Pick<
  PostRecord,
  'id' | 'lang' | 'slug' | 'title' | 'status' | 'publishedAt' | 'updatedAt'
>;

export interface PostInput {
  lang: Locale;
  slug: string;
  title?: string;
  description?: string;
  bodyMd?: string;
  status?: PostStatus;
  publishedAt?: string | null;
  coverImageId?: string | null;
  translationKey?: string | null;
  previousSlugs?: string[];
}

type PostRow = Tables<'posts'> & {
  post_tags: { tag_id: string }[];
  post_images: { image_id: string; role: string; position: number }[];
};

const POST_WITH_LINKS = '*, post_tags(tag_id), post_images(image_id, role, position)';

function idsByRole(row: PostRow, role: 'gallery' | 'inline'): string[] {
  return row.post_images
    .filter((link) => link.role === role)
    .sort((a, b) => a.position - b.position)
    .map((link) => link.image_id);
}

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    lang: parseLocale(row.lang),
    slug: row.slug,
    title: row.title,
    description: row.description,
    bodyMd: row.body_md,
    status: parsePostStatus(row.status),
    publishedAt: row.published_at,
    coverImageId: row.cover_image_id,
    translationKey: row.translation_key,
    previousSlugs: row.previous_slugs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tagIds: row.post_tags.map((link) => link.tag_id),
    galleryImageIds: idsByRole(row, 'gallery'),
    inlineImageIds: idsByRole(row, 'inline'),
  };
}

function toRow(input: Partial<PostInput>): TablesUpdate<'posts'> {
  const row: TablesUpdate<'posts'> = {};
  if (input.lang !== undefined) row.lang = input.lang;
  if (input.slug !== undefined) row.slug = input.slug;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.bodyMd !== undefined) row.body_md = input.bodyMd;
  if (input.status !== undefined) row.status = input.status;
  if (input.publishedAt !== undefined) row.published_at = input.publishedAt;
  if (input.coverImageId !== undefined) row.cover_image_id = input.coverImageId;
  if (input.translationKey !== undefined) row.translation_key = input.translationKey;
  if (input.previousSlugs !== undefined) row.previous_slugs = input.previousSlugs;
  return row;
}

export async function listPosts(
  db: DbClient,
  filter: { status?: PostStatus; lang?: Locale } = {},
): Promise<PostSummary[]> {
  let query = db
    .from('posts')
    .select('id, lang, slug, title, status, published_at, updated_at')
    .order('updated_at', { ascending: false });
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.lang) query = query.eq('lang', filter.lang);

  const rows = unwrap('listPosts', await query);
  return rows.map((row) => ({
    id: row.id,
    lang: parseLocale(row.lang),
    slug: row.slug,
    title: row.title,
    status: parsePostStatus(row.status),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}

export async function getPost(db: DbClient, id: string): Promise<PostRecord | null> {
  const row = unwrap(
    'getPost',
    await db.from('posts').select(POST_WITH_LINKS).eq('id', id).maybeSingle<PostRow>(),
  );
  return row ? toRecord(row) : null;
}

export async function createPost(db: DbClient, input: PostInput): Promise<PostRecord> {
  const insert: TablesInsert<'posts'> = { ...toRow(input), lang: input.lang, slug: input.slug };
  const row = unwrap(
    'createPost',
    await db.from('posts').insert(insert).select(POST_WITH_LINKS).single<PostRow>(),
  );
  return toRecord(row);
}

export async function updatePost(
  db: DbClient,
  id: string,
  patch: Partial<PostInput>,
): Promise<PostRecord> {
  const row = unwrap(
    'updatePost',
    await db
      .from('posts')
      .update(toRow(patch))
      .eq('id', id)
      .select(POST_WITH_LINKS)
      .maybeSingle<PostRow>(),
  );
  if (!row) throw new NotFoundError(`updatePost: post ${id} does not exist`);
  return toRecord(row);
}

export async function deletePost(db: DbClient, id: string): Promise<void> {
  unwrap('deletePost', await db.from('posts').delete().eq('id', id));
}

/**
 * A slug is taken if another post in the same language uses it now or used it before
 * (old slugs keep redirecting, so they cannot be reused).
 */
export async function isPostSlugAvailable(
  db: DbClient,
  lang: Locale,
  slug: string,
  excludePostId?: string,
): Promise<boolean> {
  // Validating first also keeps user input out of the PostgREST filter string below.
  if (!isSlug(slug)) return false;
  let query = db
    .from('posts')
    .select('id')
    .eq('lang', lang)
    .or(`slug.eq.${slug},previous_slugs.cs.{${slug}}`)
    .limit(1);
  if (excludePostId) query = query.neq('id', excludePostId);
  const rows = unwrap('isPostSlugAvailable', await query);
  return rows.length === 0;
}

/** Replaces the tags of a post in one transaction. */
export async function setPostTags(db: DbClient, postId: string, tagIds: string[]): Promise<void> {
  unwrap('setPostTags', await db.rpc('set_post_tags', { p_post_id: postId, p_tag_ids: tagIds }));
}

/** Replaces gallery and inline image references in one transaction; array order is display order. */
export async function syncPostImages(
  db: DbClient,
  postId: string,
  images: { gallery: string[]; inline: string[] },
): Promise<void> {
  unwrap(
    'syncPostImages',
    await db.rpc('sync_post_images', {
      p_post_id: postId,
      p_gallery: images.gallery,
      p_inline: images.inline,
    }),
  );
}

/** Other language versions of a post (same translation key). */
export async function listTranslations(
  db: DbClient,
  post: Pick<PostRecord, 'id' | 'translationKey'>,
): Promise<PostSummary[]> {
  if (!post.translationKey) return [];
  const rows = unwrap(
    'listTranslations',
    await db
      .from('posts')
      .select('id, lang, slug, title, status, published_at, updated_at')
      .eq('translation_key', post.translationKey)
      .neq('id', post.id),
  );
  return rows.map((row) => ({
    id: row.id,
    lang: parseLocale(row.lang),
    slug: row.slug,
    title: row.title,
    status: parsePostStatus(row.status),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Marks two posts in different languages as translations of each other by giving them the same
 * translation key (reusing an existing one). A group holds at most one post per language; the
 * unique index turns a clash into a ConflictError.
 */
export async function linkTranslation(
  db: DbClient,
  postId: string,
  counterpartId: string,
): Promise<string> {
  const [post, counterpart] = await Promise.all([getPost(db, postId), getPost(db, counterpartId)]);
  if (!post || !counterpart) throw new NotFoundError('linkTranslation: post not found');
  if (post.lang === counterpart.lang) {
    throw new DbError('A translation must be in a different language.');
  }
  const key = counterpart.translationKey ?? post.translationKey ?? crypto.randomUUID();
  if (counterpart.translationKey !== key)
    await updatePost(db, counterpart.id, { translationKey: key });
  if (post.translationKey !== key) await updatePost(db, post.id, { translationKey: key });
  return key;
}

export async function unlinkTranslation(db: DbClient, postId: string): Promise<void> {
  await updatePost(db, postId, { translationKey: null });
}
