import { loadFixtureContent } from '@soy1limon/db';
import { describe, expect, it } from 'vitest';
import { BuildContentError, buildSiteContent, postsIn, tagsIn } from './content.ts';
import { paginate } from './paginate.ts';

describe('buildSiteContent (fixtures)', () => {
  it('renders every post, newest first, with paths and resolved images', async () => {
    const content = await buildSiteContent(loadFixtureContent(), '/fixtures-media');
    expect(content.posts.map((post) => post.path)).toEqual([
      '/blog/notas-de-viaje/',
      '/en/blog/a-weekend-in-the-city/',
      '/en/blog/hello-world/',
      '/blog/hola-mundo/',
    ]);
    const hello = content.posts.find((post) => post.slug === 'hello-world');
    expect(hello?.cover?.seoName).toBe('river-at-dawn');
    expect(hello?.html).toContain('srcset="/fixtures-media/images/2026/forest-trail');
    expect(hello?.translation).toEqual({
      lang: 'es',
      path: '/blog/hola-mundo/',
      title: 'Hola, mundo',
    });
    expect(content.posts.find((post) => post.slug === 'hola-mundo')?.gallery).toHaveLength(2);
  });

  it('groups tags per language and leaves out tags without posts', async () => {
    const content = await buildSiteContent(loadFixtureContent(), '/fixtures-media');
    expect(tagsIn(content, 'en').map((entry) => [entry.tag.slug, entry.posts.length])).toEqual([
      ['notes', 1],
      ['travel', 1],
    ]);
    expect(postsIn(content, 'es')).toHaveLength(2);
  });

  it('stops the build when a published image lacks alt text in the post language', async () => {
    const fixtures = loadFixtureContent();
    const broken = {
      ...fixtures,
      images: fixtures.images.map((image) =>
        image.seoName === 'river-at-dawn' ? { ...image, alt: { es: image.alt.es ?? '' } } : image,
      ),
    };
    await expect(buildSiteContent(broken, '/m')).rejects.toBeInstanceOf(BuildContentError);
    await expect(buildSiteContent(broken, '/m')).rejects.toThrow(
      /en\/hello-world: the cover image “river-at-dawn” has no alt text in en/,
    );
  });
});

describe('paginate', () => {
  it('splits into pages and always returns at least one', () => {
    expect(paginate([1, 2, 3, 4, 5], 2).map((page) => page.items)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([1, 2, 3], 2)[1]).toMatchObject({ page: 2, totalPages: 2 });
    expect(paginate([], 10)).toEqual([{ items: [], page: 1, totalPages: 1 }]);
  });
});
