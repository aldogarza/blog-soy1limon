import { describe, expect, it } from 'vitest';
import { isSlug, SLUG_MAX_LENGTH, slugify } from './slug.ts';

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['¿Qué es el Niño?', 'que-es-el-nino'],
    ['Año nuevo en León, Guanajuato', 'ano-nuevo-en-leon-guanajuato'],
    ["Don't panic", 'dont-panic'],
    ['  --Multiple   spaces__and_symbols!!  ', 'multiple-spaces-and-symbols'],
    ['Café ☕ & crème brûlée', 'cafe-creme-brulee'],
    ['2026: a year', '2026-a-year'],
  ])('slugify(%j) -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('☕☕☕')).toBe('');
  });

  it('truncates at a word boundary without a trailing hyphen', () => {
    const long = 'word '.repeat(40);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('word-word')).toBe(true);
  });

  it('hard-cuts a single very long word', () => {
    expect(slugify('a'.repeat(200), 10)).toBe('a'.repeat(10));
  });

  it('always produces valid slugs', () => {
    for (const input of ['Hello World', '¿Qué es el Niño?', 'word '.repeat(40)]) {
      expect(isSlug(slugify(input))).toBe(true);
    }
  });
});

describe('isSlug', () => {
  it.each(['hello', 'hello-world', 'a1-b2'])('accepts %j', (value) => {
    expect(isSlug(value)).toBe(true);
  });

  it.each(['', 'Hello', 'hello--world', '-hello', 'hello-', 'héllo', 'hello_world'])(
    'rejects %j',
    (value) => {
      expect(isSlug(value)).toBe(false);
    },
  );
});
