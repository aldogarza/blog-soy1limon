import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listImages } from '@soy1limon/db/admin';
import { expect, test } from '@playwright/test';
import { adminDb, exiftool, expectNoA11yViolations, phonePhoto, plainPng } from './helpers.ts';

const run = crypto.randomUUID().slice(0, 6);
const names = { first: `e2e-${run}-sunset`, second: `e2e-${run}-park`, third: `e2e-${run}-street` };
let workDir = '';

test.beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'soy1limon-e2e-files-'));
});

test.afterAll(async () => {
  // Remove whatever this run created, even if a test failed halfway.
  const db = adminDb();
  const created = (await listImages(db)).filter((image) => image.seoName.startsWith(`e2e-${run}`));
  for (const image of created) {
    await db.from('revisions').delete().eq('entity_id', image.id);
    await db.from('images').delete().eq('id', image.id);
  }
  await exiftool.end();
  await rm(workDir, { recursive: true, force: true });
  await rm(process.env.E2E_MEDIA_ROOT ?? '', { recursive: true, force: true });
});

const publicFile = (key: string) => join(process.env.E2E_MEDIA_ROOT ?? '', 'public', key);

async function imageBySeoName(seoName: string) {
  const image = (await listImages(adminDb())).find((candidate) => candidate.seoName === seoName);
  if (!image) throw new Error(`Image ${seoName} not found`);
  return image;
}

test('the first Tab press reaches the skip link', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await expectNoA11yViolations(page);
  // Never the real repository: the e2e server runs without GITHUB_REPO / GITHUB_TOKEN.
  await expect(page.getByText('Automatic deploys are off')).toBeVisible();
});

test('upload three images, describe them one by one, and process them', async ({ page }) => {
  await page.goto('/media/upload');
  await expectNoA11yViolations(page);

  await page.getByLabel('Photos (JPEG, PNG, WebP, AVIF, TIFF, GIF or HEIC)').setInputFiles([
    {
      name: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
      buffer: await phonePhoto('Atardecer de prueba', workDir),
    },
    { name: 'park.png', mimeType: 'image/png', buffer: await plainPng() },
    { name: 'IMG_0003.jpg', mimeType: 'image/jpeg', buffer: await phonePhoto('Calle', workDir) },
  ]);

  // Step 1: prefilled from the file; focus moves to the step heading for screen readers.
  const step1 = page.getByRole('heading', { name: 'Image 1 of 3: IMG_0001.jpg' });
  await expect(step1).toBeVisible();
  await expect(step1).toBeFocused();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Atardecer de prueba');
  await expect(page.getByLabel('SEO file name')).toHaveValue(/^atardecer-de-prueba/);
  await expect(page.getByText(/Keep location \(25\.67060, -100\.37730\)/)).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel('SEO file name').fill(names.first);
  await page.getByLabel('Alt text (English)').fill('Orange sky over the city');
  await page.getByLabel('Creator').fill('E2E Creator');
  await page.getByLabel('Copyright notice').fill('© 2026 E2E');
  await page.getByLabel('Keywords').fill('sunset, test');
  await page.getByLabel(/Keep location/).check();
  await page
    .getByRole('button', { name: /Use these credits and keywords for the remaining 2/ })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied creator' })).toBeAttached();
  await page.getByRole('button', { name: 'Next image' }).click();

  // Step 2: credits were copied; leaving alt empty shows an error summary that receives focus.
  await expect(page.getByRole('heading', { name: 'Image 2 of 3: park.png' })).toBeFocused();
  await expect(page.getByLabel('Creator')).toHaveValue('E2E Creator');
  await page.getByLabel('SEO file name').fill(names.second);
  await page.getByRole('button', { name: 'Next image' }).click();
  // No role="alert": moving focus to the summary is what makes screen readers read it.
  const summary = page.locator('.error-summary', {
    has: page.getByRole('heading', { name: 'There is 1 problem' }),
  });
  await expect(summary).toBeFocused();
  await summary.getByRole('link', { name: 'Describe the image in at least one language.' }).click();
  await expect(page.getByLabel('Alt text (English)')).toBeFocused();
  await expect(page.getByLabel('Alt text (English)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Alt text (Spanish)').fill('Árboles verdes en un parque');
  await page.getByRole('button', { name: 'Next image' }).click();

  // Step 3: the single switch removes location, device and capture time.
  await expect(page.getByRole('heading', { name: 'Image 3 of 3: IMG_0003.jpg' })).toBeVisible();
  await page.getByLabel('SEO file name').fill(names.third);
  await page.getByLabel('Alt text (English)').fill('A quiet street at dawn');
  await page.getByLabel('Remove location, device and capture time from the files').check();
  await expect(page.getByLabel(/Keep device and settings/)).toBeDisabled();
  await page.getByRole('button', { name: 'Process 3 image(s)' }).click();

  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible({ timeout: 60_000 });
  for (const name of Object.values(names)) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await expectNoA11yViolations(page);

  // What visitors will download: real metadata inside the files.
  const first = await imageBySeoName(names.first);
  const firstTags = await exiftool.read(publicFile(first.variants.at(-1)?.key ?? ''));
  expect(firstTags.Creator).toBe('E2E Creator');
  expect(firstTags.GPSLongitude).toBeCloseTo(-100.3773, 3);
  expect(firstTags.Model).toBe('iPhone 18 Pro');

  const second = await imageBySeoName(names.second);
  expect(second.alt).toEqual({ es: 'Árboles verdes en un parque' });
  expect(second.metadata.creator).toBe('E2E Creator');

  const third = await imageBySeoName(names.third);
  const thirdTags = await exiftool.read(publicFile(third.variants.at(-1)?.key ?? ''));
  expect(thirdTags.GPSLatitude).toBeUndefined();
  expect(thirdTags.Model).toBeUndefined();
  expect(thirdTags.DateTimeOriginal).toBeUndefined();
  expect(thirdTags.Creator).toBe('E2E Creator');
});

test('library filters and image detail are accessible', async ({ page }) => {
  await page.goto(`/media?q=e2e-${run}&usage=unused`);
  await expect(page.getByRole('status').filter({ hasText: /^3 of/ })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole('link', { name: names.first }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `Image: ${names.first}` }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test('editing re-renders the files, keeps old ones until clean-up, and records history', async ({
  page,
}) => {
  const before = await imageBySeoName(names.second);
  await page.goto(`/media/${before.id}`);

  // Waits for the server to finish (rendering can take a few seconds), not just for the button click.
  const save = async () => {
    const response = page.waitForResponse((r) => r.url().includes('/_actions/media.update'));
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await response).ok()).toBe(true);
    await page.waitForURL(`/media/${before.id}?saved`);
    await expect(page.getByText('Changes saved and new files generated.')).toBeVisible();
  };

  // The 900 px image only has compact-profile variants, which do not embed the title: the files
  // stay byte-identical, so their content-addressed keys do not change and nothing is retired.
  await page.getByLabel('Title', { exact: true }).fill('Parque en otoño');
  await save();
  const titleOnly = await imageBySeoName(names.second);
  expect(titleOnly.metadata.title).toBe('Parque en otoño');
  expect(titleOnly.variants.map((variant) => variant.key)).toEqual(
    before.variants.map((variant) => variant.key),
  );
  expect(titleOnly.retiredKeys).toEqual([]);

  // The creator is embedded in every variant: all files change and the old ones are retired.
  await page.getByLabel('Creator').fill('E2E Editor');
  await save();
  const after = await imageBySeoName(names.second);
  expect(after.metadata.creator).toBe('E2E Editor');
  expect(after.retiredKeys).toEqual(before.variants.map((variant) => variant.key));
  // Three saves so far (upload + two edits): the two older ones can be restored.
  await expect(page.getByRole('button', { name: 'Restore this version' })).toHaveCount(2);

  await page.getByRole('button', { name: /Delete \d+ retired file\(s\)/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Deleted \d+ retired file/ }),
  ).toBeVisible();
  expect((await imageBySeoName(names.second)).retiredKeys).toEqual([]);
});

test('deleting requires an explicit confirmation', async ({ page }) => {
  const image = await imageBySeoName(names.third);
  await page.goto(`/media/${image.id}`);
  const button = page.getByRole('button', { name: 'Delete image' });
  await button.click();
  // The required checkbox blocks submission until it is ticked.
  await expect(page).toHaveURL(new RegExp(`/media/${image.id}$`));
  await page.getByLabel(/I understand this permanently deletes/).check();
  await button.click();
  await expect(
    page.getByRole('status').filter({ hasText: `Deleted “${names.third}”` }),
  ).toBeVisible();
  expect((await listImages(adminDb())).some((candidate) => candidate.id === image.id)).toBe(false);
});
