import type { EmbeddedMetadata, ImageStatus, ImageVariant, LocalizedText } from '@soy1limon/core';
import { isSlug } from '@soy1limon/core';
import type { DbClient } from '../clients.ts';
import type { Tables, TablesUpdate } from '../database.types.ts';
import { DbError, NotFoundError, unwrap } from '../errors.ts';
import { parseImageStatus, parseLocalizedText, parseMetadata, parseVariants } from './parse.ts';

export interface ImageRecord {
  id: string;
  seoName: string;
  status: ImageStatus;
  originalKey: string;
  originalFilename: string;
  originalMime: string;
  originalBytes: number;
  width: number | null;
  height: number | null;
  dominantColor: string | null;
  variants: ImageVariant[];
  metadata: EmbeddedMetadata;
  alt: LocalizedText;
  caption: LocalizedText;
  watermark: boolean;
  retiredKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NewImageInput {
  /** Callers may choose the id up front so storage keys can be derived before the row exists. */
  id?: string;
  seoName: string;
  originalKey: string;
  originalFilename: string;
  originalMime: string;
  originalBytes: number;
  watermark?: boolean;
  metadata?: EmbeddedMetadata;
  alt?: LocalizedText;
  caption?: LocalizedText;
}

export interface ImagePatch {
  seoName?: string;
  status?: ImageStatus;
  width?: number;
  height?: number;
  dominantColor?: string | null;
  variants?: ImageVariant[];
  metadata?: EmbeddedMetadata;
  alt?: LocalizedText;
  caption?: LocalizedText;
  watermark?: boolean;
  retiredKeys?: string[];
}

export interface ImageReferences {
  coverOf: string[];
  gallery: string[];
  inline: string[];
}

export class ImageInUseError extends DbError {
  override name = 'ImageInUseError';

  readonly references: ImageReferences;

  constructor(imageId: string, references: ImageReferences) {
    super(`Image ${imageId} is still used by posts and cannot be deleted`);
    this.references = references;
  }
}

function toRecord(row: Tables<'images'>): ImageRecord {
  return {
    id: row.id,
    seoName: row.seo_name,
    status: parseImageStatus(row.status),
    originalKey: row.original_key,
    originalFilename: row.original_filename,
    originalMime: row.original_mime,
    originalBytes: row.original_bytes,
    width: row.width,
    height: row.height,
    dominantColor: row.dominant_color,
    variants: parseVariants(row.variants),
    metadata: parseMetadata(row.metadata),
    alt: parseLocalizedText(row.alt),
    caption: parseLocalizedText(row.caption),
    watermark: row.watermark,
    retiredKeys: row.retired_keys,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(patch: ImagePatch): TablesUpdate<'images'> {
  const row: TablesUpdate<'images'> = {};
  if (patch.seoName !== undefined) row.seo_name = patch.seoName;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.width !== undefined) row.width = patch.width;
  if (patch.height !== undefined) row.height = patch.height;
  if (patch.dominantColor !== undefined) row.dominant_color = patch.dominantColor;
  if (patch.variants !== undefined) row.variants = patch.variants;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;
  if (patch.alt !== undefined) row.alt = patch.alt;
  if (patch.caption !== undefined) row.caption = patch.caption;
  if (patch.watermark !== undefined) row.watermark = patch.watermark;
  if (patch.retiredKeys !== undefined) row.retired_keys = patch.retiredKeys;
  return row;
}

export async function listImages(
  db: DbClient,
  filter: { status?: ImageStatus } = {},
): Promise<ImageRecord[]> {
  let query = db.from('images').select('*').order('created_at', { ascending: false });
  if (filter.status) query = query.eq('status', filter.status);
  return unwrap('listImages', await query).map(toRecord);
}

export async function getImage(db: DbClient, id: string): Promise<ImageRecord | null> {
  const row = unwrap('getImage', await db.from('images').select('*').eq('id', id).maybeSingle());
  return row ? toRecord(row) : null;
}

export async function createImage(db: DbClient, input: NewImageInput): Promise<ImageRecord> {
  const row = unwrap(
    'createImage',
    await db
      .from('images')
      .insert({
        ...(input.id ? { id: input.id } : {}),
        seo_name: input.seoName,
        original_key: input.originalKey,
        original_filename: input.originalFilename,
        original_mime: input.originalMime,
        original_bytes: input.originalBytes,
        ...(input.watermark !== undefined ? { watermark: input.watermark } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        ...(input.alt ? { alt: input.alt } : {}),
        ...(input.caption ? { caption: input.caption } : {}),
      })
      .select('*')
      .single(),
  );
  return toRecord(row);
}

export async function updateImage(
  db: DbClient,
  id: string,
  patch: ImagePatch,
): Promise<ImageRecord> {
  const row = unwrap(
    'updateImage',
    await db.from('images').update(toRow(patch)).eq('id', id).select('*').maybeSingle(),
  );
  if (!row) throw new NotFoundError(`updateImage: image ${id} does not exist`);
  return toRecord(row);
}

export async function findImageReferences(db: DbClient, imageId: string): Promise<ImageReferences> {
  const [covers, links] = await Promise.all([
    db.from('posts').select('id').eq('cover_image_id', imageId),
    db.from('post_images').select('post_id, role').eq('image_id', imageId),
  ]);
  const coverRows = unwrap('findImageReferences(covers)', covers);
  const linkRows = unwrap('findImageReferences(links)', links);
  return {
    coverOf: coverRows.map((row) => row.id),
    gallery: linkRows.filter((row) => row.role === 'gallery').map((row) => row.post_id),
    inline: linkRows.filter((row) => row.role === 'inline').map((row) => row.post_id),
  };
}

/** Ids of every image referenced by any post (cover, gallery or inline), for "unused" filters. */
export async function listUsedImageIds(db: DbClient): Promise<Set<string>> {
  const [covers, links] = await Promise.all([
    db.from('posts').select('cover_image_id').not('cover_image_id', 'is', null),
    db.from('post_images').select('image_id'),
  ]);
  const used = new Set<string>();
  for (const row of unwrap('listUsedImageIds(covers)', covers)) {
    if (row.cover_image_id) used.add(row.cover_image_id);
  }
  for (const row of unwrap('listUsedImageIds(links)', links)) used.add(row.image_id);
  return used;
}

/**
 * Deletes the row only when no post uses the image. The foreign keys enforce the same rule;
 * checking first gives the admin a readable explanation instead of a constraint error.
 */
export async function deleteImage(db: DbClient, id: string): Promise<void> {
  const references = await findImageReferences(db, id);
  if (references.coverOf.length + references.gallery.length + references.inline.length > 0) {
    throw new ImageInUseError(id, references);
  }
  unwrap('deleteImage', await db.from('images').delete().eq('id', id));
}

export async function isSeoNameAvailable(
  db: DbClient,
  seoName: string,
  excludeImageId?: string,
): Promise<boolean> {
  if (!isSlug(seoName)) return false;
  let query = db.from('images').select('id').eq('seo_name', seoName).limit(1);
  if (excludeImageId) query = query.neq('id', excludeImageId);
  return unwrap('isSeoNameAvailable', await query).length === 0;
}
