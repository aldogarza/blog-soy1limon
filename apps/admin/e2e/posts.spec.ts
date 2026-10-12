import { rm } from 'node:fs/promises';
import { getPost, listPosts, listTags, listTranslations } from '@soy1limon/db/admin';
import { closeExiftool } from '@soy1limon/media';
import { expect, type Page, test } from '@playwright/test';
import { adminDb, exiftool, expectNoA11yViolations, seedImage } from './helpers.ts';

const run = crypto.randomUUID().slice(0, 6);
const created = { images: [] as string[], tags: [] as string[] };
const img = { a: '', b: '', c: '' };

test.beforeAll(async () => {
  img.a = await seedImage(created.images, `e2e-${run}-river`, '#1e90ff', {
    en: 'A blue river',
    es: 'Un río azul',
  });
  img.b = await seedImage(created.images, `e2e-${run}-only-spanish`, '#8b4513', {
    es: 'Solo en español',
  });
  img.c = await seedImage(created.images, `e2e-${run}-forest`, '#228b22', {
    en: 'A green forest',
    es: 'Un bosque verde',
  });
});

test.afterAll(async () => {
  const db = adminDb();
  const posts = (await listPosts(db)).filter((post) => post.slug.includes(run));
  for (const post of posts) {
    await db.from('revisions').delete().eq('entity_id', post.id);
    await db.from('posts').delete().eq('id', post.id);
  }
  for (const tag of (await listTags(db)).filter((t) => t.slug.includes(run))) {
    await db.from('tags').delete().eq('id', tag.id);
  }
  for (const id of created.images) {
    await db.from('revisions').delete().eq('entity_id', id);
    await db.from('images').delete().eq('id', id);
  }
  await exiftool.end();
  await closeExiftool();
  await rm(process.env.E2E_MEDIA_ROOT ?? '', { recursive: true, force: true });
});

async function createPost(
  page: Page,
  language: 'English' | 'Spanish',
  title: string,
): Promise<string> {
  await page.goto('/posts/new');
  await page.getByLabel(language, { exact: true }).check();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/);
  return page.url().split('/').at(-1) ?? '';
}

const body = (page: Page) => page.getByLabel('Post body (Markdown)');

async function pick(page: Page, dialogName: string, names: string[], confirm: string) {
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  for (const name of names) await dialog.getByLabel(new RegExp(name)).check();
  await dialog.getByRole('button', { name: confirm }).click();
  await expect(dialog).toBeHidden();
}

let englishId = '';

test('write, validate and publish an English post with cover, gallery, inline image and tag', async ({
  page,
}) => {
  englishId = await createPost(page, 'English', `Trip ${run}`);
  await expect(page.getByLabel('Address (slug)')).toHaveValue(`trip-${run}`);
  await expectNoA11yViolations(page);

  // The address follows the title while it is a fresh draft.
  await page.getByLabel('Title', { exact: true }).fill(`Weekend trip ${run}`);
  await expect(page.getByLabel('Address (slug)')).toHaveValue(`weekend-trip-${run}`);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Two days by the river and in the forest.');

  // Toolbar and keyboard shortcut on the plain textarea.
  await body(page).fill('Intro paragraph.\n\n');
  await body(page).press('End');
  await page.getByRole('button', { name: /^Bold/ }).click();
  await expect(body(page)).toHaveValue(/\*\*bold text\*\*/);

  // Inline image through the accessible dialog.
  await page.getByRole('button', { name: 'Insert image' }).click();
  await pick(page, 'Insert images into the body', [`e2e-${run}-river`], 'Insert');
  await expect(body(page)).toHaveValue(new RegExp(`!\\[\\]\\(image:${img.a}\\)`));

  // A cover without English alt text blocks publishing, with a clear message.
  await page.getByRole('button', { name: 'Choose cover' }).click();
  await pick(page, 'Choose the cover image', [`e2e-${run}-only-spanish`], 'Use as cover');
  const needed = page.getByRole('heading', { name: 'Needed before publishing' });
  await expect(needed).toBeVisible();
  await expect(
    page.getByText(`The cover image “e2e-${run}-only-spanish” needs alt text in English.`).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'needs alt text in English' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Change cover' }).click();
  await pick(page, 'Choose the cover image', [`e2e-${run}-river`], 'Use as cover');
  await expect(needed).toBeHidden();

  // Gallery ordering with buttons (no drag and drop needed).
  await page.getByRole('button', { name: 'Add images to the gallery' }).click();
  await pick(
    page,
    'Add images to the gallery',
    [`e2e-${run}-river`, `e2e-${run}-forest`],
    'Add to gallery',
  );
  await page.getByRole('button', { name: `Move up e2e-${run}-forest` }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `e2e-${run}-forest moved to position 1 of 2` }),
  ).toBeAttached();

  // A new tag is created and selected in place.
  await page.getByText('Create a tag').click();
  await page.getByLabel('Name in English').fill(`Rivers ${run}`);
  await page.getByLabel('Name in Spanish').fill(`Ríos ${run}`);
  await page.getByRole('button', { name: 'Create and select' }).click();
  await expect(page.getByLabel(`Rivers ${run}`)).toBeChecked();

  // The preview uses the public pipeline: responsive image with the English alt.
  await expect(page.locator('.preview img[alt="A blue river"]')).toHaveAttribute('srcset', /400w/);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText(/Status:\s*published/)).toBeVisible();
  // The tests blank the GitHub settings: publishing says so instead of starting a real deploy.
  await expect(
    page.getByRole('status').filter({ hasText: 'was not rebuilt automatically' }),
  ).toBeVisible();

  const post = await getPost(adminDb(), englishId);
  expect(post).toMatchObject({
    status: 'published',
    slug: `weekend-trip-${run}`,
    coverImageId: img.a,
    galleryImageIds: [img.c, img.a],
    inlineImageIds: [img.a],
  });
  expect(post?.tagIds).toHaveLength(1);
});

test('link a Spanish translation and keep the old address after renaming', async ({ page }) => {
  const spanishId = await createPost(page, 'Spanish', `Viaje ${run}`);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Dos días junto al río y en el bosque.');
  await body(page).fill('Un párrafo en español.');
  await page
    .getByLabel('This post is a translation of')
    .selectOption({ label: `Weekend trip ${run} (en)` });
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText(/Status:\s*published/)).toBeVisible();

  const spanish = await getPost(adminDb(), spanishId);
  expect(spanish?.lang).toBe('es');
  const translations = await listTranslations(adminDb(), {
    id: spanishId,
    translationKey: spanish?.translationKey ?? null,
  });
  expect(translations.map((t) => t.id)).toEqual([englishId]);

  // Renaming a published post keeps the old address as a redirect.
  await page.goto(`/posts/${englishId}`);
  await page.getByLabel('Address (slug)').fill(`river-weekend-${run}`);
  await page.getByRole('button', { name: 'Update published post' }).click();
  await expect(
    page.getByText(`Old addresses that still redirect here: weekend-trip-${run}`),
  ).toBeVisible();
  expect((await getPost(adminDb(), englishId))?.previousSlugs).toEqual([`weekend-trip-${run}`]);
});

test('compare and restore an older version', async ({ page }) => {
  await page.goto(`/posts/${englishId}`);
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('listitem')).toHaveCount(2);

  await history.getByRole('button', { name: 'Compare with the editor' }).nth(1).click();
  await expect(page.getByRole('heading', { name: 'Changes since that version' })).toBeVisible();
  await expect(
    page.locator('.comparison ins').filter({ hasText: `river-weekend-${run}` }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await history.getByRole('button', { name: 'Restore this version' }).click();
  await page.waitForLoadState('load');
  await expect(page.getByLabel('Address (slug)')).toHaveValue(`weekend-trip-${run}`);
  expect((await getPost(adminDb(), englishId))?.slug).toBe(`weekend-trip-${run}`);
});

test('drafts save automatically', async ({ page }) => {
  const id = await createPost(page, 'English', `Draft ${run}`);
  await page.getByLabel('Description', { exact: true }).fill('Saved without pressing any button.');
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved.' })).toBeVisible({
    timeout: 10_000,
  });
  expect((await getPost(adminDb(), id))?.description).toBe('Saved without pressing any button.');
});

test('the post list filters by status and is accessible', async ({ page }) => {
  await page.goto('/posts?status=published');
  await expect(page.getByRole('link', { name: `Weekend trip ${run}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Draft ${run}` })).toHaveCount(0);
  await expectNoA11yViolations(page);
});
