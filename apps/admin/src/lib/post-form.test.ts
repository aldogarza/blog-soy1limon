import { describe, expect, it } from 'vitest';
import {
  displayStatus,
  move,
  nextPreviousSlugs,
  type PostFormValues,
  postFormSchema,
  publicPath,
} from './post-form.ts';
import { checkPublishable } from './post-validation.ts';

const IMG = '11111111-1111-4111-8111-111111111111';

const values: PostFormValues = {
  lang: 'es',
  title: 'Un viaje a la Huasteca',
  slug: 'un-viaje-a-la-huasteca',
  description: 'Fotos y notas de un fin de semana en la Huasteca Potosina.',
  bodyMd: 'Texto del post.',
  coverImageId: IMG,
  galleryImageIds: [],
  tagIds: [],
  translationOf: null,
};

const images = new Map([[IMG, { seoName: 'cascada', alt: { es: 'Cascada turquesa' } }]]);

describe('postFormSchema', () => {
  it('accepts an incomplete draft as long as the slug is valid', () => {
    expect(
      postFormSchema.safeParse({ ...values, title: '', description: '', bodyMd: '' }).success,
    ).toBe(true);
  });

  it('rejects an invalid slug with a helpful message', () => {
    const result = postFormSchema.safeParse({ ...values, slug: 'Un Viaje' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/lowercase letters/);
  });
});

describe('checkPublishable', () => {
  it('passes a complete post', () => {
    expect(checkPublishable(values, [], images)).toEqual({ errors: [], warnings: [] });
  });

  it('requires title, description and body', () => {
    const { errors } = checkPublishable(
      { ...values, title: '', description: '', bodyMd: ' ' },
      [],
      images,
    );
    expect(errors).toEqual([
      'Add a title.',
      'Add a description (it is shown in search results and link previews).',
      'Write the post body.',
    ]);
  });

  it('requires alt text in the post language for cover and gallery images', () => {
    const english = { ...values, lang: 'en' as const, galleryImageIds: [IMG] };
    expect(checkPublishable(english, [], images).errors).toEqual([
      'The cover image “cascada” needs alt text in English.',
      'The gallery image “cascada” needs alt text in English.',
    ]);
  });

  it('blocks on body problems but only warns about removed HTML and long texts', () => {
    const result = checkPublishable(
      { ...values, description: 'x'.repeat(200) },
      [
        'The image abc does not exist or is not ready.',
        'Raw HTML is not allowed in posts and was removed. Use Markdown instead.',
      ],
      images,
    );
    expect(result.errors).toEqual(['The image abc does not exist or is not ready.']);
    expect(result.warnings).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('builds public paths with the language prefix only for Spanish', () => {
    expect(publicPath('en', 'hello')).toBe('/blog/hello/');
    expect(publicPath('es', 'hola')).toBe('/es/blog/hola/');
  });

  it('derives the scheduled status from a future date', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(displayStatus({ status: 'published', publishedAt: '2026-10-13T00:00:00Z' }, now)).toBe(
      'scheduled',
    );
    expect(displayStatus({ status: 'published', publishedAt: '2026-10-11T00:00:00Z' }, now)).toBe(
      'published',
    );
    expect(displayStatus({ status: 'draft', publishedAt: null }, now)).toBe('draft');
  });

  it('moves items up and down without going out of bounds', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('records the old slug when a published post is renamed, and forgets it when moving back', () => {
    const published = { slug: 'old', status: 'published', previousSlugs: [] };
    expect(nextPreviousSlugs(published, 'new')).toEqual(['old']);
    expect(
      nextPreviousSlugs({ slug: 'new', status: 'published', previousSlugs: ['old'] }, 'old'),
    ).toEqual(['new']);
    expect(nextPreviousSlugs({ slug: 'old', status: 'draft', previousSlugs: [] }, 'new')).toEqual(
      [],
    );
  });
});
