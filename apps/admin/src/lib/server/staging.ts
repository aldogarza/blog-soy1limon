import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Uploads wait here between "inspect" (prefill the form) and "create" (process and store), so the
 * file is sent from the browser only once. Lives under the git-ignored local media root.
 */

const stagedSchema = z.object({
  token: z.uuid(),
  filename: z.string(),
  mime: z.string(),
  ext: z.string().regex(/^[a-z0-9]+$/),
  bytes: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export type StagedUpload = z.infer<typeof stagedSchema>;

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function paths(root: string, token: string) {
  // Tokens are generated server-side, but they come back from the browser: never trust the shape.
  const valid = z.uuid().safeParse(token);
  if (!valid.success) throw new Error('Invalid staging token');
  const dir = join(root, 'staging');
  return {
    dir,
    file: join(dir, `${token}.upload`),
    meta: join(dir, `${token}.json`),
    preview: join(dir, `${token}.webp`),
  };
}

export async function stageUpload(
  root: string,
  input: { buffer: Buffer; filename: string; mime: string; ext: string; preview: Buffer },
): Promise<StagedUpload> {
  const staged: StagedUpload = {
    token: crypto.randomUUID(),
    filename: input.filename,
    mime: input.mime,
    ext: input.ext,
    bytes: input.buffer.byteLength,
    createdAt: new Date().toISOString(),
  };
  const p = paths(root, staged.token);
  await mkdir(p.dir, { recursive: true });
  await Promise.all([
    writeFile(p.file, input.buffer),
    writeFile(p.preview, input.preview),
    writeFile(p.meta, JSON.stringify(staged)),
  ]);
  return staged;
}

export async function readStaged(
  root: string,
  token: string,
): Promise<{ staged: StagedUpload; buffer: Buffer }> {
  const p = paths(root, token);
  const staged = stagedSchema.parse(JSON.parse(await readFile(p.meta, 'utf8')));
  return { staged, buffer: await readFile(p.file) };
}

export async function readStagedPreview(root: string, token: string): Promise<Buffer> {
  return readFile(paths(root, token).preview);
}

export async function discardStaged(root: string, token: string): Promise<void> {
  const p = paths(root, token);
  await Promise.all([p.file, p.meta, p.preview].map((path) => rm(path, { force: true })));
}

/** Removes uploads abandoned for more than a day (closed tab, crash). */
export async function pruneStaging(root: string, now = Date.now()): Promise<void> {
  const dir = join(root, 'staging');
  const entries = await readdir(dir).catch(() => []);
  await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > MAX_AGE_MS) await rm(path, { force: true });
    }),
  );
}
