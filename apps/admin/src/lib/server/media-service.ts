import { siteConfig } from '@soy1limon/core';
import {
  createImage,
  deleteImage,
  getImage,
  getRevision,
  type ImageRecord,
  isSeoNameAvailable,
  type JsonObject,
  recordRevision,
  updateImage,
} from '@soy1limon/db/admin';
import {
  inspectImage,
  type MediaStorage,
  previewImage,
  processImage,
  readMetadata,
  reprocessImage,
  type SensitiveMatch,
} from '@soy1limon/media';
import {
  altText,
  captionText,
  type ImageFormValues,
  imageFormSchema,
  primaryAltText,
  type TechnicalMetadata,
  technicalFrom,
  toEmbeddedMetadata,
  valuesFromSuggestion,
} from '../image-form.ts';
import { localMediaRoot } from './env.ts';
import { getDb, getStorage } from './services.ts';
import { discardStaged, pruneStaging, readStaged, stageUpload } from './staging.ts';

export interface InspectedUpload {
  token: string;
  filename: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  previewUrl: string;
  values: ImageFormValues;
  technical: TechnicalMetadata;
  sensitiveMatches: SensitiveMatch[];
}

/** Validates and stages an upload, and returns everything the form needs to prefill itself. */
export async function inspectUpload(file: File): Promise<InspectedUpload> {
  const root = localMediaRoot();
  await pruneStaging(root);
  const buffer = Buffer.from(await file.arrayBuffer());
  const inspected = await inspectImage({ buffer, filename: file.name });
  const staged = await stageUpload(root, {
    buffer,
    filename: file.name,
    mime: inspected.mime,
    ext: inspected.ext,
    preview: await previewImage(buffer),
  });

  // The suggested name must also be free in the database, otherwise the form starts invalid.
  let seoName = inspected.suggestion.seoName;
  for (let n = 2; !(await isSeoNameAvailable(getDb(), seoName)); n += 1) {
    seoName = `${inspected.suggestion.seoName}-${n}`;
  }

  return {
    token: staged.token,
    filename: file.name,
    mime: inspected.mime,
    bytes: inspected.bytes,
    width: inspected.width,
    height: inspected.height,
    previewUrl: `/staging/${staged.token}`,
    values: valuesFromSuggestion({ ...inspected.suggestion, seoName }, siteConfig),
    technical: technicalFrom(inspected.file.metadata),
    sensitiveMatches: inspected.sensitiveMatches,
  };
}

export async function discardUpload(token: string): Promise<void> {
  await discardStaged(localMediaRoot(), token);
}

/**
 * Camera, location and capture time as recorded in the untouched original, so a field removed in
 * an earlier edit can be brought back.
 */
export async function technicalFromOriginal(
  image: Pick<ImageRecord, 'originalKey' | 'originalFilename'>,
  storage: MediaStorage = getStorage(),
): Promise<TechnicalMetadata> {
  const buffer = await storage.getOriginal(image.originalKey);
  const { file } = await readMetadata({ buffer, filename: image.originalFilename });
  return technicalFrom(file.metadata);
}

function revisionSnapshot(values: ImageFormValues): JsonObject {
  return { values };
}

/**
 * Processes a staged upload and stores it. The row is created first (status "processing") so the
 * storage keys can use its id; if processing fails the row is removed again.
 */
export async function createFromStaging(
  token: string,
  rawValues: ImageFormValues,
  storage: MediaStorage = getStorage(),
): Promise<ImageRecord> {
  const values = imageFormSchema.parse(rawValues);
  const db = getDb();
  const root = localMediaRoot();
  const { staged, buffer } = await readStaged(root, token);

  if (!(await isSeoNameAvailable(db, values.seoName))) {
    throw new Error(`The file name "${values.seoName}" is already used by another image.`);
  }

  const { file } = await readMetadata({ buffer, filename: staged.filename });
  const technical = technicalFrom(file.metadata);
  const metadata = toEmbeddedMetadata(values, technical);
  const id = crypto.randomUUID();

  await createImage(db, {
    id,
    seoName: values.seoName,
    originalKey: `originals/${id}.${staged.ext}`,
    originalFilename: staged.filename,
    originalMime: staged.mime,
    originalBytes: staged.bytes,
    watermark: values.watermark,
    metadata,
    alt: altText(values),
    caption: captionText(values),
  });

  try {
    const result = await processImage(
      { buffer, filename: staged.filename },
      {
        id,
        seoName: values.seoName,
        metadata,
        altText: primaryAltText(values, siteConfig.defaultLocale),
        watermark: values.watermark,
      },
      storage,
    );
    const record = await updateImage(db, id, {
      status: 'ready',
      width: result.width,
      height: result.height,
      dominantColor: result.dominantColor,
      variants: result.variants,
    });
    await recordRevision(db, 'image', id, revisionSnapshot(values));
    await discardStaged(root, token);
    return record;
  } catch (error) {
    await db.from('images').delete().eq('id', id);
    throw error;
  }
}

/**
 * Applies edited values to a stored image. Anything embedded in the files (name, metadata, alt,
 * watermark) needs new variants rendered from the original; the old keys are retired, not deleted,
 * so cached pages keep working until an explicit clean-up.
 */
export async function updateFromForm(
  id: string,
  rawValues: ImageFormValues,
  storage: MediaStorage = getStorage(),
): Promise<ImageRecord> {
  const values = imageFormSchema.parse(rawValues);
  const db = getDb();
  const current = await getImage(db, id);
  if (!current) throw new Error('This image no longer exists.');
  if (!(await isSeoNameAvailable(db, values.seoName, id))) {
    throw new Error(`The file name "${values.seoName}" is already used by another image.`);
  }

  const technical = await technicalFromOriginal(current, storage);
  const metadata = toEmbeddedMetadata(values, technical);
  const embeddedAlt = primaryAltText(values, siteConfig.defaultLocale);

  const result = await reprocessImage(
    { originalKey: current.originalKey, originalFilename: current.originalFilename },
    { id, seoName: values.seoName, metadata, altText: embeddedAlt, watermark: values.watermark },
    storage,
  );

  const newKeys = new Set(result.variants.map((variant) => variant.key));
  const retired = current.variants.map((variant) => variant.key).filter((key) => !newKeys.has(key));

  const record = await updateImage(db, id, {
    seoName: values.seoName,
    metadata,
    alt: altText(values),
    caption: captionText(values),
    watermark: values.watermark,
    status: 'ready',
    width: result.width,
    height: result.height,
    dominantColor: result.dominantColor,
    variants: result.variants,
    retiredKeys: [...new Set([...current.retiredKeys, ...retired])],
  });
  await recordRevision(db, 'image', id, revisionSnapshot(values));
  return record;
}

/** Deletes an unused image: database row first (refused if a post uses it), then every file. */
export async function removeImage(id: string, storage: MediaStorage = getStorage()): Promise<void> {
  const db = getDb();
  const image = await getImage(db, id);
  if (!image) return;
  await deleteImage(db, id);
  await storage.deletePublic([
    ...image.variants.map((variant) => variant.key),
    ...image.retiredKeys,
  ]);
  await storage.deleteOriginal(image.originalKey);
  await db.from('revisions').delete().eq('entity_type', 'image').eq('entity_id', id);
}

/** Deletes files left behind by renames and re-processing. */
export async function cleanupRetired(
  id: string,
  storage: MediaStorage = getStorage(),
): Promise<number> {
  const db = getDb();
  const image = await getImage(db, id);
  if (!image || image.retiredKeys.length === 0) return 0;
  await storage.deletePublic(image.retiredKeys);
  await updateImage(db, id, { retiredKeys: [] });
  return image.retiredKeys.length;
}

/** Re-applies the form values saved in a revision (which itself records a new revision). */
export async function restoreRevision(revisionId: string): Promise<ImageRecord> {
  const revision = await getRevision(getDb(), revisionId);
  if (!revision || revision.entityType !== 'image') throw new Error('Revision not found.');
  const values = imageFormSchema.parse(revision.snapshot.values);
  return updateFromForm(revision.entityId, values);
}
