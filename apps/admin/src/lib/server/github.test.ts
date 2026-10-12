import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, GitHubApiError } from './github.ts';

const REPO = 'owner/blog';
const TOKEN = 'github_pat_test';

function fakeFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createGitHubClient', () => {
  it('sends a repository_dispatch with only a generic reason', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 204 }));
    await createGitHubClient({ repo: REPO, token: TOKEN, fetch }).dispatchContentChanged('publish');

    const [call] = calls;
    expect(call?.url).toBe(`https://api.github.com/repos/${REPO}/dispatches`);
    expect(call?.init.method).toBe('POST');
    expect(new Headers(call?.init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(call?.init.body))).toEqual({
      event_type: 'content-changed',
      client_payload: { reason: 'publish' },
    });
  });

  it('lists the runs of the deploy workflow', async () => {
    const { fetch, calls } = fakeFetch(
      json({
        total_count: 1,
        workflow_runs: [
          {
            id: 7,
            status: 'completed',
            conclusion: 'success',
            event: 'schedule',
            created_at: '2026-10-12T12:17:00Z',
            updated_at: '2026-10-12T12:19:00Z',
            html_url: 'https://github.com/owner/blog/actions/runs/7',
          },
        ],
      }),
    );
    const runs = await createGitHubClient({ repo: REPO, token: TOKEN, fetch }).listDeployRuns(3);
    expect(calls[0]?.url).toBe(
      `https://api.github.com/repos/${REPO}/actions/workflows/deploy.yml/runs?per_page=3`,
    );
    expect(runs).toEqual([
      {
        id: 7,
        status: 'completed',
        conclusion: 'success',
        event: 'schedule',
        createdAt: '2026-10-12T12:17:00Z',
        updatedAt: '2026-10-12T12:19:00Z',
        url: 'https://github.com/owner/blog/actions/runs/7',
      },
    ]);
  });

  it('enables the workflow with PUT', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 204 }));
    await createGitHubClient({ repo: REPO, token: TOKEN, fetch }).enableDeployWorkflow();
    expect(calls[0]?.init.method).toBe('PUT');
    expect(calls[0]?.url).toMatch(/\/actions\/workflows\/deploy\.yml\/enable$/);
  });

  it.each([
    [401, /invalid or expired/],
    [403, /Actions: read and write/],
    [404, /cannot do this on owner\/blog/],
  ])('explains HTTP %i without leaking the token', async (status, message) => {
    const { fetch } = fakeFetch(json({ message: 'Bad credentials' }, status));
    const error = await createGitHubClient({ repo: REPO, token: TOKEN, fetch })
      .dispatchContentChanged('manual')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).message).toMatch(message);
    expect((error as GitHubApiError).message).not.toContain(TOKEN);
  });

  it('says when the deploy workflow is missing instead of blaming the token', async () => {
    const { fetch } = fakeFetch(json({ message: 'Not Found' }, 404));
    await expect(
      createGitHubClient({ repo: REPO, token: TOKEN, fetch }).listDeployRuns(),
    ).rejects.toThrow(/no \.github\/workflows\/deploy\.yml/);
  });

  it('reports network failures as GitHubApiError', async () => {
    const fetch = vi.fn(() =>
      Promise.reject(new TypeError('fetch failed')),
    ) as unknown as typeof globalThis.fetch;
    await expect(
      createGitHubClient({ repo: REPO, token: TOKEN, fetch }).getDeployWorkflow(),
    ).rejects.toThrow(/Could not reach GitHub/);
  });
});
