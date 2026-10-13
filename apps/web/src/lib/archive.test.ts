import { describe, expect, it } from 'vitest';
import { splitArchive } from './archive.ts';

describe('splitArchive', () => {
  const posts = Array.from({ length: 8 }, (_, index) => index);

  it('keeps the newest posts apart and pages the rest', () => {
    const { recent, pages } = splitArchive(posts, 3, 2);
    expect(recent).toEqual([0, 1, 2]);
    expect(pages.map((page) => page.items)).toEqual([[3, 4], [5, 6], [7]]);
    expect(pages.map((page) => page.totalPages)).toEqual([3, 3, 3]);
  });

  it('yields one empty page when every post fits in the latest group', () => {
    const { recent, pages } = splitArchive(posts.slice(0, 2), 3, 2);
    expect(recent).toEqual([0, 1]);
    expect(pages).toEqual([{ items: [], page: 1, totalPages: 1 }]);
  });
});
