import { ConflictError } from '@soy1limon/db';
import { ImageInUseError, isSeoNameAvailable } from '@soy1limon/db/admin';
import { UnsupportedImageError } from '@soy1limon/media';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import { imageFormSchema } from '../lib/image-form.ts';
import {
  cleanupRetired,
  createFromStaging,
  discardUpload,
  inspectUpload,
  removeImage,
  restoreRevision,
  updateFromForm,
} from '../lib/server/media-service.ts';
import { getDb } from '../lib/server/services.ts';

/** Turns known failures into messages the form can show; everything else is a 500 with its text. */
function toActionError(error: unknown): ActionError {
  if (error instanceof ActionError) return error;
  if (error instanceof UnsupportedImageError) {
    return new ActionError({ code: 'BAD_REQUEST', message: error.message });
  }
  if (error instanceof ImageInUseError) {
    const posts =
      error.references.coverOf.length +
      error.references.gallery.length +
      error.references.inline.length;
    return new ActionError({
      code: 'CONFLICT',
      message: `This image is used by ${posts} post reference(s). Remove it from those posts first.`,
    });
  }
  if (error instanceof ConflictError) {
    return new ActionError({ code: 'CONFLICT', message: 'That name is already taken.' });
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(error);
  return new ActionError({ code: 'INTERNAL_SERVER_ERROR', message });
}

async function run<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw toActionError(error);
  }
}

export const server = {
  media: {
    inspect: defineAction({
      accept: 'form',
      input: z.object({ file: z.instanceof(File) }),
      handler: ({ file }) => run(() => inspectUpload(file)),
    }),

    discard: defineAction({
      input: z.object({ token: z.uuid() }),
      handler: ({ token }) => run(() => discardUpload(token)),
    }),

    checkSeoName: defineAction({
      input: z.object({ seoName: z.string(), excludeId: z.uuid().optional() }),
      handler: ({ seoName, excludeId }) =>
        run(async () => ({ available: await isSeoNameAvailable(getDb(), seoName, excludeId) })),
    }),

    create: defineAction({
      input: z.object({ token: z.uuid(), values: imageFormSchema }),
      handler: ({ token, values }) =>
        run(async () => {
          const image = await createFromStaging(token, values);
          return { id: image.id, seoName: image.seoName };
        }),
    }),

    update: defineAction({
      input: z.object({ id: z.uuid(), values: imageFormSchema }),
      handler: ({ id, values }) =>
        run(async () => {
          const image = await updateFromForm(id, values);
          return { id: image.id, seoName: image.seoName };
        }),
    }),

    delete: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) => run(() => removeImage(id)),
    }),

    cleanupRetired: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: ({ id }) => run(async () => ({ deleted: await cleanupRetired(id) })),
    }),

    restoreRevision: defineAction({
      accept: 'form',
      input: z.object({ revisionId: z.uuid() }),
      handler: ({ revisionId }) =>
        run(async () => {
          const image = await restoreRevision(revisionId);
          return { id: image.id };
        }),
    }),
  },
};
