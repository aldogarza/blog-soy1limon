import { describe, expect, it } from 'vitest';
import { blogPath, homePath, postPath, rssPath, searchPath, tagPath, tagsPath } from './routes.ts';

describe('routes', () => {
  it('uses no prefix for Spanish and /en for English', () => {
    expect(homePath('en')).toBe('/en/');
    expect(homePath('es')).toBe('/');
    expect(postPath('en', 'hello')).toBe('/en/blog/hello/');
    expect(postPath('es', 'hola')).toBe('/blog/hola/');
  });

  it('keeps page 1 of the archive at the blog index', () => {
    expect(blogPath('en')).toBe('/en/blog/');
    expect(blogPath('en', 1)).toBe('/en/blog/');
    expect(blogPath('es', 3)).toBe('/blog/page/3/');
  });

  it('builds tag, search and feed paths', () => {
    expect(tagsPath('es')).toBe('/tags/');
    expect(tagPath('en', 'travel')).toBe('/en/tags/travel/');
    expect(searchPath('en')).toBe('/en/search/');
    expect(rssPath('es')).toBe('/rss.xml');
  });
});
