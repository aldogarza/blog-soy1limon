import {
  type Locale,
  LOCALES,
  postPath,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  siteConfig,
} from '@soy1limon/core';
import { z } from 'zod';

// Shared by the browser and the server. Drafts may be incomplete; publishing applies the strict
// checks in post-validation.ts on top of this schema.

export const postFormSchema = z.object({
  lang: z.enum(LOCALES),
  title: z.string().trim().max(200, { error: 'Use at most 200 characters.' }),
  slug: z
    .string()
    .trim()
    .min(1, { error: 'Enter the address of the post.' })
    .max(SLUG_MAX_LENGTH, { error: `Use at most ${SLUG_MAX_LENGTH} characters.` })
    .regex(SLUG_PATTERN, {
      error: 'Use lowercase letters, numbers and single hyphens, e.g. "my-first-trip".',
    }),
  description: z.string().trim().max(300, { error: 'Use at most 300 characters.' }),
  bodyMd: z.string().max(200_000, { error: 'The post is too long.' }),
  coverImageId: z.uuid().nullable(),
  galleryImageIds: z.array(z.uuid()).max(200),
  tagIds: z.array(z.uuid()),
  /** Id of the post this one translates (other language), or null. */
  translationOf: z.uuid().nullable(),
});

export type PostFormValues = z.infer<typeof postFormSchema>;

export const TITLE_RECOMMENDED = siteConfig.seo.titleMaxLength;
export const DESCRIPTION_RECOMMENDED = siteConfig.seo.descriptionMaxLength;

/** Public path of a post (shared with the public site through packages/core). */
export const publicPath = (lang: Locale, slug: string): string => postPath(lang, slug);

export function valuesFromPost(
  post: {
    lang: Locale;
    title: string;
    slug: string;
    description: string;
    bodyMd: string;
    coverImageId: string | null;
    galleryImageIds: string[];
    tagIds: string[];
  },
  translationOf: string | null,
): PostFormValues {
  return {
    lang: post.lang,
    title: post.title,
    slug: post.slug,
    description: post.description,
    bodyMd: post.bodyMd,
    coverImageId: post.coverImageId,
    galleryImageIds: [...post.galleryImageIds],
    tagIds: [...post.tagIds],
    translationOf,
  };
}

/** Status shown to the author: "scheduled" is a published post whose date is still in the future. */
export function displayStatus(
  post: { status: string; publishedAt: string | null },
  now = Date.now(),
): 'draft' | 'scheduled' | 'published' | 'archived' {
  if (post.status === 'published') {
    return post.publishedAt && Date.parse(post.publishedAt) > now ? 'scheduled' : 'published';
  }
  return post.status === 'archived' ? 'archived' : 'draft';
}

/** Moves an item one position up or down; used by the keyboard-friendly gallery ordering. */
export function move<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  if (item !== undefined) copy.splice(target, 0, item);
  return copy;
}

/**
 * Old slugs that must keep redirecting. A published post that changes its slug adds the old one;
 * moving back to an old slug removes it from the list (it is the current address again).
 */
export function nextPreviousSlugs(
  current: { slug: string; status: string; previousSlugs: string[] },
  newSlug: string,
): string[] {
  const previous = current.previousSlugs.filter((slug) => slug !== newSlug);
  if (
    current.status === 'published' &&
    current.slug !== newSlug &&
    !previous.includes(current.slug)
  ) {
    previous.push(current.slug);
  }
  return previous;
}
