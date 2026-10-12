import { describe, expect, it } from 'vitest';
import { deployedSince, deployParam, isLive, messageFromParam, runLabel } from './deploy.ts';

const NOW = Date.parse('2026-10-12T12:00:00Z');

describe('isLive', () => {
  it('is true only for published posts whose date has come', () => {
    expect(isLive({ status: 'published', publishedAt: '2026-10-12T11:00:00Z' }, NOW)).toBe(true);
    expect(isLive({ status: 'published', publishedAt: '2026-10-12T13:00:00Z' }, NOW)).toBe(false);
    expect(isLive({ status: 'published', publishedAt: null }, NOW)).toBe(false);
    expect(isLive({ status: 'draft', publishedAt: '2026-10-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isLive({ status: 'archived', publishedAt: '2026-10-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });
});

describe('deployedSince', () => {
  const run = (createdAt: string, conclusion: string | null, status = 'completed') => ({
    status,
    conclusion,
    createdAt,
  });
  const changedAt = '2026-10-12T10:00:00Z';

  it('needs a successful run that started after the change', () => {
    expect(deployedSince([run('2026-10-12T10:05:00Z', 'success')], changedAt)).toBe(true);
  });

  it('ignores runs that started before the change, even if they finished later', () => {
    expect(deployedSince([run('2026-10-12T09:59:00Z', 'success')], changedAt)).toBe(false);
  });

  it('ignores failed and unfinished runs', () => {
    expect(
      deployedSince(
        [run('2026-10-12T10:05:00Z', 'failure'), run('2026-10-12T10:06:00Z', null, 'in_progress')],
        changedAt,
      ),
    ).toBe(false);
  });
});

describe('labels and messages', () => {
  it('describes runs', () => {
    expect(runLabel({ status: 'in_progress', conclusion: null, createdAt: '' })).toBe('Running');
    expect(runLabel({ status: 'queued', conclusion: null, createdAt: '' })).toBe(
      'Waiting to start',
    );
    expect(runLabel({ status: 'completed', conclusion: 'success', createdAt: '' })).toBe(
      'Deployed',
    );
    expect(runLabel({ status: 'completed', conclusion: 'failure', createdAt: '' })).toBe('Failed');
  });

  it('round-trips a trigger through the URL', () => {
    expect(deployParam(null)).toBe('');
    expect(deployParam({ status: 'started' })).toBe('deploy=started');
    expect(messageFromParam('started')).toMatch(/rebuilding/);
    expect(messageFromParam('failed')).toMatch(/not rebuilt/);
    expect(messageFromParam('<script>')).toBeNull();
    expect(messageFromParam(null)).toBeNull();
  });
});
