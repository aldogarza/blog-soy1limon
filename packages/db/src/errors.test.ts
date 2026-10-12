import { PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ConflictError, DbError, toDbError, unwrap } from './errors.ts';

const pgError = (code: string) =>
  new PostgrestError({ message: 'failed', code, details: 'detail', hint: '' });

describe('toDbError', () => {
  it('maps unique violations to ConflictError', () => {
    const error = toDbError('createPost', pgError('23505'));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe('createPost: failed');
  });

  it('keeps other errors as DbError with their code', () => {
    const error = toDbError('listPosts', pgError('42501'));
    expect(error).not.toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(DbError);
    expect(error.code).toBe('42501');
  });
});

describe('unwrap', () => {
  it('returns data on success', () => {
    expect(unwrap('ctx', { data: [1, 2], error: null })).toEqual([1, 2]);
  });

  it('throws on failure', () => {
    expect(() => unwrap('ctx', { data: null, error: pgError('42501') })).toThrow('ctx: failed');
  });
});
