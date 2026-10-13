import { siteConfig } from '@soy1limon/core';
import { webEnv } from './env.ts';
import { type Page, paginate } from './paginate.ts';

export interface Archive<T> {
  /** The home page's "latest" group (the first one is featured). */
  recent: T[];
  /** Every other post. Page 1 is shown on the home page; later pages get their own address. */
  pages: Page<T>[];
}

/** Splits posts (newest first) into the latest group and the pages of all the others. */
export function splitArchive<T>(
  posts: readonly T[],
  recentCount: number,
  perPage: number,
): Archive<T> {
  return {
    recent: posts.slice(0, recentCount),
    pages: paginate(posts.slice(recentCount), perPage),
  };
}

export function postsPerPage(): number {
  return webEnv().POSTS_PER_PAGE ?? siteConfig.blog.postsPerPage;
}

/** The home page's split with the configured sizes. */
export function siteArchive<T>(posts: readonly T[]): Archive<T> {
  return splitArchive(posts, siteConfig.blog.recentPosts, postsPerPage());
}
