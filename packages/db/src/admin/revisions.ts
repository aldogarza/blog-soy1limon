import type { DbClient } from '../clients.ts';
import type { Json } from '../database.types.ts';
import { unwrap } from '../errors.ts';

export type RevisionEntity = 'post' | 'image';

export type JsonObject = Record<string, Json | undefined>;

export interface RevisionSummary {
  id: string;
  createdAt: string;
}

export interface Revision extends RevisionSummary {
  entityType: RevisionEntity;
  entityId: string;
  snapshot: JsonObject;
}

/** Stores a snapshot; the database keeps only the newest 50 per entity. */
export async function recordRevision(
  db: DbClient,
  entityType: RevisionEntity,
  entityId: string,
  snapshot: JsonObject,
): Promise<RevisionSummary> {
  const row = unwrap(
    'recordRevision',
    await db
      .from('revisions')
      .insert({ entity_type: entityType, entity_id: entityId, snapshot })
      .select('id, created_at')
      .single(),
  );
  return { id: row.id, createdAt: row.created_at };
}

export async function listRevisions(
  db: DbClient,
  entityType: RevisionEntity,
  entityId: string,
): Promise<RevisionSummary[]> {
  const rows = unwrap(
    'listRevisions',
    await db
      .from('revisions')
      .select('id, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false }),
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getRevision(db: DbClient, id: string): Promise<Revision | null> {
  const row = unwrap(
    'getRevision',
    await db.from('revisions').select('*').eq('id', id).maybeSingle(),
  );
  if (!row) return null;
  if (row.entity_type !== 'post' && row.entity_type !== 'image') {
    throw new Error(`getRevision: unexpected entity type ${row.entity_type}`);
  }
  if (!isJsonObject(row.snapshot)) throw new Error(`getRevision: snapshot ${id} is not an object`);
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    snapshot: row.snapshot,
    createdAt: row.created_at,
  };
}
