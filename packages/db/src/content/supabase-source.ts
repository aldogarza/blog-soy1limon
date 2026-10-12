import type { DbClient } from '../clients.ts';
import { fetchAllRows } from '../paginate.ts';
import { parsePublishedContent, type PublishedContent } from './schemas.ts';

const POST_COLUMNS =
  'id, lang, slug, title, description, body_md, published_at, updated_at, translation_key, previous_slugs, cover_image_id, post_tags(tag_id), post_images(image_id, role, position)';

// Must match the column-level grant for the anon role in the initial migration.
export const PUBLIC_IMAGE_COLUMNS =
  'id, seo_name, width, height, dominant_color, variants, metadata, alt, caption, updated_at';

interface PostRow {
  id: string;
  lang: string;
  slug: string;
  title: string;
  description: string;
  body_md: string;
  published_at: string | null;
  updated_at: string;
  translation_key: string | null;
  previous_slugs: string[];
  cover_image_id: string | null;
  post_tags: { tag_id: string }[];
  post_images: { image_id: string; role: string; position: number }[];
}

interface ImageRow {
  id: string;
  seo_name: string;
  width: number | null;
  height: number | null;
  dominant_color: string | null;
  variants: unknown;
  metadata: unknown;
  alt: unknown;
  caption: unknown;
  updated_at: string;
}

function imageIdsByRole(links: PostRow['post_images'], role: 'gallery' | 'inline'): string[] {
  return links
    .filter((link) => link.role === role)
    .sort((a, b) => a.position - b.position)
    .map((link) => link.image_id);
}

export function mapPostRow(row: PostRow) {
  return {
    id: row.id,
    lang: row.lang,
    slug: row.slug,
    title: row.title,
    description: row.description,
    bodyMd: row.body_md,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    translationKey: row.translation_key,
    previousSlugs: row.previous_slugs,
    coverImageId: row.cover_image_id,
    tagIds: row.post_tags.map((link) => link.tag_id),
    galleryImageIds: imageIdsByRole(row.post_images, 'gallery'),
    inlineImageIds: imageIdsByRole(row.post_images, 'inline'),
  };
}

export function mapImageRow(row: ImageRow) {
  return {
    id: row.id,
    seoName: row.seo_name,
    width: row.width,
    height: row.height,
    dominantColor: row.dominant_color,
    variants: row.variants,
    metadata: row.metadata,
    alt: row.alt,
    caption: row.caption,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads everything the public site needs in three queries.
 * RLS on the server decides what is visible; nothing here filters by status.
 */
export async function fetchPublishedContent(db: DbClient): Promise<PublishedContent> {
  const [posts, tags, images] = await Promise.all([
    fetchAllRows<PostRow>('posts', (from, to) =>
      db
        .from('posts')
        .select(POST_COLUMNS)
        .order('published_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    fetchAllRows('tags', (from, to) =>
      db.from('tags').select('id, slug, labels').order('slug').range(from, to),
    ),
    fetchAllRows<ImageRow>('images', (from, to) =>
      db.from('images').select(PUBLIC_IMAGE_COLUMNS).order('id').range(from, to),
    ),
  ]);

  return parsePublishedContent(
    { posts: posts.map(mapPostRow), tags, images: images.map(mapImageRow) },
    'Supabase',
  );
}
