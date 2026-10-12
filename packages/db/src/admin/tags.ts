import type { LocalizedText } from '@soy1limon/core';
import type { DbClient } from '../clients.ts';
import type { Tables } from '../database.types.ts';
import { NotFoundError, unwrap } from '../errors.ts';
import { parseLocalizedText } from './parse.ts';

export interface TagRecord {
  id: string;
  slug: string;
  labels: LocalizedText;
  createdAt: string;
}

function toRecord(row: Tables<'tags'>): TagRecord {
  return {
    id: row.id,
    slug: row.slug,
    labels: parseLocalizedText(row.labels),
    createdAt: row.created_at,
  };
}

export async function listTags(db: DbClient): Promise<TagRecord[]> {
  return unwrap('listTags', await db.from('tags').select('*').order('slug')).map(toRecord);
}

export async function createTag(
  db: DbClient,
  input: { slug: string; labels: LocalizedText },
): Promise<TagRecord> {
  const row = unwrap(
    'createTag',
    await db.from('tags').insert({ slug: input.slug, labels: input.labels }).select('*').single(),
  );
  return toRecord(row);
}

export async function updateTag(
  db: DbClient,
  id: string,
  patch: { slug?: string; labels?: LocalizedText },
): Promise<TagRecord> {
  const row = unwrap(
    'updateTag',
    await db.from('tags').update(patch).eq('id', id).select('*').maybeSingle(),
  );
  if (!row) throw new NotFoundError(`updateTag: tag ${id} does not exist`);
  return toRecord(row);
}

export async function deleteTag(db: DbClient, id: string): Promise<void> {
  unwrap('deleteTag', await db.from('tags').delete().eq('id', id));
}
