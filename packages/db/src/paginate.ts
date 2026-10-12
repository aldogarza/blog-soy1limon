import type { PostgrestError } from '@supabase/supabase-js';
import { toDbError } from './errors.ts';

// Supabase caps every response at `max_rows` (1000 by default), so large reads must page.
export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/** Fetches every row by requesting consecutive ranges until a short page comes back. */
export async function fetchAllRows<T>(
  context: string,
  fetchPage: (from: number, to: number) => PageResult<T>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw toDbError(context, error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
