import { describe, expect, it } from 'vitest';
import { anonDb } from '../test/local-stack.ts';
import { fetchPublishedContent } from './content/supabase-source.ts';

// Runs the exact query path of the public build, with the publishable key, against the seed data.
describe('fetchPublishedContent', () => {
  it('returns validated content with published posts only', async () => {
    const content = await fetchPublishedContent(anonDb());
    const slugs = content.posts.map((post) => `${post.lang}/${post.slug}`);

    expect(slugs).toContain('en/hello-world');
    expect(slugs).toContain('es/hola-mundo');
    expect(slugs).not.toContain('es/borrador-de-viaje');
    expect(slugs).not.toContain('en/scheduled-post');
  });

  it('links translations through the shared translation key', async () => {
    const content = await fetchPublishedContent(anonDb());
    const english = content.posts.find((post) => post.slug === 'hello-world');
    const spanish = content.posts.find((post) => post.slug === 'hola-mundo');
    expect(english?.translationKey).toBeTruthy();
    expect(english?.translationKey).toBe(spanish?.translationKey);
  });

  it('includes tag ids and labels', async () => {
    const content = await fetchPublishedContent(anonDb());
    const notes = content.tags.find((tag) => tag.slug === 'notes');
    const hello = content.posts.find((post) => post.slug === 'hello-world');
    expect(notes?.labels).toEqual({ en: 'Notes', es: 'Notas' });
    expect(hello?.tagIds).toContain(notes?.id);
  });
});
