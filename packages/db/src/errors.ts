import type { PostgrestError } from '@supabase/supabase-js';

export class DbError extends Error {
  override name = 'DbError';

  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** A unique constraint was violated (duplicate slug, duplicate seo_name, …). */
export class ConflictError extends DbError {
  override name = 'ConflictError';
}

export class NotFoundError extends DbError {
  override name = 'NotFoundError';
}

const UNIQUE_VIOLATION = '23505';

export function toDbError(context: string, error: PostgrestError): DbError {
  const message = `${context}: ${error.message}`;
  if (error.code === UNIQUE_VIOLATION) return new ConflictError(message, error.code, error.details);
  return new DbError(message, error.code, error.details);
}

interface QueryResult {
  data: unknown;
  error: PostgrestError | null;
}

// supabase-js responses are `{ data: T; error: null } | { data: null; error: PostgrestError }`.
// Inferring T from that union picks `null` in some cases, so take `data` from the success branch only.
type SuccessData<R> = R extends { error: null; data: infer D } ? D : never;

/** Returns `data` or throws a typed error; keeps call sites free of repetitive error checks. */
export function unwrap<R extends QueryResult>(context: string, result: R): SuccessData<R> {
  if (result.error) throw toDbError(context, result.error);
  return result.data as SuccessData<R>;
}
