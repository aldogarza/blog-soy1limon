import { describe, expect, it } from 'vitest';
import {
  archivePath,
  homePath,
  legacyBlogPath,
  postPath,
  rssPath,
  searchPath,
  tagPath,
} from './routes.ts';

describe('routes', () => {
  it('uses no prefix for Spanish and /en for English', () => {
    expect(homePath('en')).toBe('/en/');
    expect(homePath('es')).toBe('/');
    expect(postPath('en', 'hello')).toBe('/en/blog/hello/');
    expect(postPath('es', 'hola')).toBe('/blog/hola/');
  });

  it('starts the archive on the home page', () => {
    expect(archivePath('en')).toBe('/en/');
    expect(archivePath('es', 1)).toBe('/');
    expect(archivePath('es', 3)).toBe('/page/3/');
    expect(archivePath('en', 2)).toBe('/en/page/2/');
    expect(legacyBlogPath('es')).toBe('/blog/');
  });

  it('builds tag, search and feed paths', () => {
    expect(tagPath('en', 'travel')).toBe('/en/tags/travel/');
    expect(searchPath('en')).toBe('/en/search/');
    expect(rssPath('es')).toBe('/rss.xml');
  });
});
