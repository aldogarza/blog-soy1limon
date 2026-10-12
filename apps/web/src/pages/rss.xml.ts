import rss from '@astrojs/rss';
import { homePath, siteConfig } from '@soy1limon/core';
import type { APIRoute } from 'astro';
import { postsIn, siteContent } from '../lib/content.ts';

export const GET: APIRoute = async (context) => {
  const posts = postsIn(await siteContent(), 'en');
  return rss({
    title: siteConfig.title.en,
    description: siteConfig.description.en,
    site: new URL(homePath('en'), context.site).href,
    customData: '<language>en</language>',
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      link: post.path,
      pubDate: new Date(post.publishedAt),
    })),
  });
};
