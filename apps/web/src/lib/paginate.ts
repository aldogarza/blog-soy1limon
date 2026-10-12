export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** Splits items into fixed-size pages; an empty list still yields one (empty) page. */
export function paginate<T>(items: readonly T[], perPage: number): Page<T>[] {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  return Array.from({ length: totalPages }, (_, index) => ({
    items: items.slice(index * perPage, (index + 1) * perPage),
    page: index + 1,
    totalPages,
  }));
}
