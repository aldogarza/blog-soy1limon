import { describe, expect, it } from 'vitest';
import { blogPath, homePath, postPath, rssPath, searchPath, tagPath, tagsPath } from './routes.ts';

describe('routes', () => {
  it('uses no prefix for English and /es for Spanish', () => {
    expect(homePath('en')).toBe('/');
    expect(homePath('es')).toBe('/es/');
    expect(postPath('en', 'hello')).toBe('/blog/hello/');
    expect(postPath('es', 'hola')).toBe('/es/blog/hola/');
  });

  it('keeps page 1 of the archive at the blog index', () => {
    expect(blogPath('en')).toBe('/blog/');
    expect(blogPath('en', 1)).toBe('/blog/');
    expect(blogPath('es', 3)).toBe('/es/blog/page/3/');
  });

  it('builds tag, search and feed paths', () => {
    expect(tagsPath('es')).toBe('/es/tags/');
    expect(tagPath('en', 'travel')).toBe('/tags/travel/');
    expect(searchPath('en')).toBe('/search/');
    expect(rssPath('es')).toBe('/es/rss.xml');
  });
});
