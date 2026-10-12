import { type Locale, postPath } from '@soy1limon/core';
import {
  loadPublishedContent,
  type PublicImage,
  type PublishedContent,
  type PublishedPost,
  type Tag,
} from '@soy1limon/db';
import { type Heading, type ImageForRender, renderMarkdown } from '@soy1limon/markdown';
import { mediaBaseUrl, webEnv } from './env.ts';

export interface SitePost extends PublishedPost {
  path: string;
  html: string;
  headings: Heading[];
  readingMinutes: number;
  tags: Tag[];
  cover: PublicImage | undefined;
  gallery: PublicImage[];
  /** The same post in the other language, if linked. */
  translation: { lang: Locale; path: string; title: string } | undefined;
}

export interface SiteContent {
  posts: SitePost[];
  tags: Tag[];
  images: Map<string, PublicImage>;
}

export class BuildContentError extends Error {
  override name = 'BuildContentError';
}

const byNewest = (a: PublishedPost, b: PublishedPost) =>
  Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug);

/**
 * Turns published rows into everything the pages need. Any content problem (missing image or alt
 * text) stops the build: a broken page must never be published.
 */
export async function buildSiteContent(
  content: PublishedContent,
  mediaBase: string,
): Promise<SiteContent> {
  const images = new Map(content.images.map((image) => [image.id, image]));
  const tags = new Map(content.tags.map((tag) => [tag.id, tag]));
  const renderable = new Map<string, ImageForRender>(
    content.images.map((image) => [image.id, { ...image }]),
  );

  const problems: string[] = [];
  const posts: SitePost[] = [];
  for (const post of [...content.posts].sort(byNewest)) {
    const rendered = await renderMarkdown(post.bodyMd, {
      lang: post.lang,
      images: renderable,
      mediaBaseUrl: mediaBase,
    });
    for (const problem of rendered.problems) problems.push(`${post.lang}/${post.slug}: ${problem}`);

    const resolve = (id: string, role: string) => {
      const image = images.get(id);
      if (!image) problems.push(`${post.lang}/${post.slug}: the ${role} image ${id} is missing.`);
      else if (!image.alt[post.lang])
        problems.push(
          `${post.lang}/${post.slug}: the ${role} image “${image.seoName}” has no alt text in ${post.lang}.`,
        );
      return image;
    };

    posts.push({
      ...post,
      path: postPath(post.lang, post.slug),
      html: rendered.html,
      headings: rendered.headings,
      readingMinutes: rendered.readingMinutes,
      tags: post.tagIds.map((id) => tags.get(id)).filter((tag) => tag !== undefined),
      cover: post.coverImageId ? resolve(post.coverImageId, 'cover') : undefined,
      gallery: post.galleryImageIds
        .map((id) => resolve(id, 'gallery'))
        .filter((image) => image !== undefined),
      translation: undefined,
    });
  }

  if (problems.length > 0) {
    throw new BuildContentError(
      `Published content has problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  for (const post of posts) {
    const other = post.translationKey
      ? posts.find(
          (candidate) =>
            candidate.translationKey === post.translationKey && candidate.lang !== post.lang,
        )
      : undefined;
    if (other) post.translation = { lang: other.lang, path: other.path, title: other.title };
  }

  return { posts, tags: content.tags, images };
}

let cached: Promise<SiteContent> | undefined;

/** Loaded and rendered once per build, shared by every page. */
export function siteContent(): Promise<SiteContent> {
  cached ??= loadPublishedContent(webEnv()).then((content) =>
    buildSiteContent(content, mediaBaseUrl()),
  );
  return cached;
}

export function postsIn(content: SiteContent, lang: Locale): SitePost[] {
  return content.posts.filter((post) => post.lang === lang);
}

/** Tags that have at least one post in the language, with those posts (newest first). */
export function tagsIn(content: SiteContent, lang: Locale): { tag: Tag; posts: SitePost[] }[] {
  return content.tags
    .map((tag) => ({
      tag,
      posts: postsIn(content, lang).filter((post) => post.tagIds.includes(tag.id)),
    }))
    .filter((entry) => entry.posts.length > 0)
    .sort((a, b) =>
      (a.tag.labels[lang] ?? a.tag.slug).localeCompare(b.tag.labels[lang] ?? b.tag.slug, lang),
    );
}

export function tagLabel(tag: Tag, lang: Locale): string {
  return tag.labels[lang] ?? tag.labels.en ?? tag.labels.es ?? tag.slug;
}
