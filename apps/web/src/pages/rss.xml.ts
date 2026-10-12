import rss from '@astrojs/rss';
import { homePath, siteConfig } from '@soy1limon/core';
import type { APIRoute } from 'astro';
import { postsIn, siteContent } from '../lib/content.ts';

export const GET: APIRoute = async (context) => {
  const posts = postsIn(await siteContent(), 'es');
  return rss({
    title: siteConfig.title.es,
    description: siteConfig.description.es,
    site: new URL(homePath('es'), context.site).href,
    customData: '<language>es</language>',
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      link: post.path,
      pubDate: new Date(post.publishedAt),
    })),
  });
};
