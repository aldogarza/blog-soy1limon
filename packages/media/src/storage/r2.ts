import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { assertSafeKey, type MediaStorage, PUBLIC_CACHE_CONTROL } from './types.ts';

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  mediaBucket: string;
  originalsBucket: string;
  /** Public custom domain of the media bucket, e.g. https://img.example.com */
  publicBaseUrl: string;
}

/** Minimal surface of S3Client used here; lets tests inject a fake. */
export interface S3Like {
  send: S3Client['send'];
}

// S3 DeleteObjects accepts at most 1000 keys per request.
const DELETE_BATCH = 1000;

export function createR2Storage(options: R2Options, client?: S3Like): MediaStorage {
  const s3: S3Like =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  const baseUrl = options.publicBaseUrl.replace(/\/+$/, '');

  return {
    async putPublic(key, body, contentType) {
      assertSafeKey(key);
      await s3.send(
        new PutObjectCommand({
          Bucket: options.mediaBucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: PUBLIC_CACHE_CONTROL,
        }),
      );
    },
    async putOriginal(key, body, contentType) {
      assertSafeKey(key);
      await s3.send(
        new PutObjectCommand({
          Bucket: options.originalsBucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async getOriginal(key) {
      assertSafeKey(key);
      const result = await s3.send(
        new GetObjectCommand({ Bucket: options.originalsBucket, Key: key }),
      );
      if (!result.Body) throw new Error(`Original ${key} has no body`);
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async deletePublic(keys) {
      keys.forEach(assertSafeKey);
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: options.mediaBucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },
    async deleteOriginal(key) {
      assertSafeKey(key);
      await s3.send(new DeleteObjectCommand({ Bucket: options.originalsBucket, Key: key }));
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `${baseUrl}/${key}`;
    },
  };
}
