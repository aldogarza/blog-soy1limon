import { describe, expect, it } from 'vitest';
import { loadFixtureContent } from './fixtures-source.ts';
import { ContentValidationError, parsePublishedContent } from './schemas.ts';
import { mapPostRow } from './supabase-source.ts';

describe('fixtures', () => {
  it('are valid published content', () => {
    const content = loadFixtureContent();
    expect(content.posts.length).toBeGreaterThan(0);
  });

  it('only reference tags and images that exist', () => {
    const content = loadFixtureContent();
    const tagIds = new Set(content.tags.map((tag) => tag.id));
    const imageIds = new Set(content.images.map((image) => image.id));
    for (const post of content.posts) {
      for (const id of post.tagIds) expect(tagIds.has(id)).toBe(true);
      for (const id of [...post.galleryImageIds, ...post.inlineImageIds]) {
        expect(imageIds.has(id)).toBe(true);
      }
      if (post.coverImageId) expect(imageIds.has(post.coverImageId)).toBe(true);
    }
  });
});

describe('mapPostRow', () => {
  it('splits image links by role and sorts them by position', () => {
    const post = mapPostRow({
      id: 'p',
      lang: 'en',
      slug: 's',
      title: 't',
      description: 'd',
      body_md: '',
      published_at: '2026-01-01T00:00:00+00:00',
      updated_at: '2026-01-01T00:00:00+00:00',
      translation_key: null,
      previous_slugs: [],
      cover_image_id: null,
      post_tags: [{ tag_id: 'a' }],
      post_images: [
        { image_id: 'g2', role: 'gallery', position: 1 },
        { image_id: 'i1', role: 'inline', position: 0 },
        { image_id: 'g1', role: 'gallery', position: 0 },
      ],
    });
    expect(post.galleryImageIds).toEqual(['g1', 'g2']);
    expect(post.inlineImageIds).toEqual(['i1']);
    expect(post.tagIds).toEqual(['a']);
  });
});

describe('parsePublishedContent', () => {
  it('names the source and the broken field', () => {
    expect(() =>
      parsePublishedContent({ posts: [{ id: 'nope' }], tags: [], images: [] }, 'test'),
    ).toThrow(ContentValidationError);
    expect(() =>
      parsePublishedContent({ posts: [{ id: 'nope' }], tags: [], images: [] }, 'test'),
    ).toThrow(/Invalid content from test:[\s\S]*posts\.0\.id/);
  });
});
