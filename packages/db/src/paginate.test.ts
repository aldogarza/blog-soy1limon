import { PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { fetchAllRows } from './paginate.ts';

const rows = Array.from({ length: 7 }, (_, i) => i);

describe('fetchAllRows', () => {
  it('keeps requesting ranges until a short page arrives', async () => {
    const ranges: [number, number][] = [];
    const result = await fetchAllRows(
      'numbers',
      (from, to) => {
        ranges.push([from, to]);
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      3,
    );
    expect(result).toEqual(rows);
    expect(ranges).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ]);
  });

  it('does one extra request when the last page is exactly full', async () => {
    let calls = 0;
    const result = await fetchAllRows(
      'numbers',
      (from, to) => {
        calls += 1;
        return Promise.resolve({ data: rows.slice(0, 6).slice(from, to + 1), error: null });
      },
      3,
    );
    expect(result).toHaveLength(6);
    expect(calls).toBe(3);
  });

  it('throws a DbError with context when a page fails', async () => {
    await expect(
      fetchAllRows('posts', () =>
        Promise.resolve({
          data: null,
          error: new PostgrestError({ message: 'boom', code: 'XX000', details: '', hint: '' }),
        }),
      ),
    ).rejects.toMatchObject({ name: 'DbError', message: 'posts: boom', code: 'XX000' });
  });
});
