export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_MAX_LENGTH = 80;

export function isSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * Turns any title (English or Spanish) into a URL- and filename-safe slug:
 * "¿Qué es el Niño?" -> "que-es-el-nino".
 */
export function slugify(input: string, maxLength: number = SLUG_MAX_LENGTH): string {
  const slug = input
    .normalize('NFKD')
    // Drop combining marks left by NFKD so accented letters keep their base letter.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes join words instead of splitting them: "don't" -> "dont".
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug;

  const truncated = slug.slice(0, maxLength);
  const lastHyphen = truncated.lastIndexOf('-');
  // Prefer cutting at a word boundary unless that would throw away most of the slug.
  const cut = lastHyphen > maxLength / 2 ? truncated.slice(0, lastHyphen) : truncated;
  return cut.replace(/-+$/g, '');
}
