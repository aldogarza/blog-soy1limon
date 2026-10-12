import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  discardStaged,
  pruneStaging,
  readStaged,
  readStagedPreview,
  stageUpload,
} from './staging.ts';

const roots: string[] = [];
afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'soy1limon-staging-'));
  roots.push(dir);
  return dir;
}

const input = {
  buffer: Buffer.from('original bytes'),
  filename: 'IMG_0001.HEIC',
  mime: 'image/heic',
  ext: 'heic',
  preview: Buffer.from('preview bytes'),
};

describe('staging', () => {
  it('round-trips an upload and its preview, then discards it', async () => {
    const dir = await root();
    const staged = await stageUpload(dir, input);
    const { staged: read, buffer } = await readStaged(dir, staged.token);
    expect(read).toEqual(staged);
    expect(buffer.toString()).toBe('original bytes');
    expect((await readStagedPreview(dir, staged.token)).toString()).toBe('preview bytes');

    await discardStaged(dir, staged.token);
    expect(await readdir(join(dir, 'staging'))).toEqual([]);
  });

  it.each(['../../etc/passwd', 'not-a-uuid', ''])('rejects the token %j', async (token) => {
    const dir = await root();
    await expect(readStaged(dir, token)).rejects.toThrow('Invalid staging token');
  });

  it('prunes uploads older than a day and keeps recent ones', async () => {
    const dir = await root();
    const old = await stageUpload(dir, input);
    const fresh = await stageUpload(dir, input);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const suffix of ['upload', 'json', 'webp']) {
      await utimes(join(dir, 'staging', `${old.token}.${suffix}`), twoDaysAgo, twoDaysAgo);
    }
    await pruneStaging(dir);
    const left = await readdir(join(dir, 'staging'));
    expect(left.some((name) => name.startsWith(old.token))).toBe(false);
    expect(left.filter((name) => name.startsWith(fresh.token))).toHaveLength(3);
  });
});
