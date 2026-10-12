// Pure helpers about the public site's deploys, shared by the server code and the pages.

export type DeployReason =
  'publish' | 'update' | 'unpublish' | 'archive' | 'delete' | 'image' | 'manual';

/** Result of asking GitHub to rebuild the site. Requesting a rebuild never fails the edit itself. */
export type DeployTrigger =
  { status: 'started' } | { status: 'not-configured' } | { status: 'failed'; message: string };

/** Minimal shape of a deploy run, as returned by lib/server/github.ts. */
export interface RunLike {
  status: string;
  conclusion: string | null;
  createdAt: string;
}

/** True when the post is visible on the public site right now (published and its date has come). */
export function isLive(
  post: { status: string; publishedAt: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  return (
    post?.status === 'published' && post.publishedAt !== null && Date.parse(post.publishedAt) <= now
  );
}

/**
 * True when a successful deploy *started* after `since`: only then did its build read the newer
 * rows. Runs that started earlier may have read the old data even if they finished later.
 */
export function deployedSince(runs: readonly RunLike[], since: string): boolean {
  const changedAt = Date.parse(since);
  return runs.some(
    (run) =>
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      Date.parse(run.createdAt) > changedAt,
  );
}

/** Short, human description of a run's state. */
export function runLabel(run: RunLike): string {
  if (run.status !== 'completed') {
    return run.status === 'in_progress' ? 'Running' : 'Waiting to start';
  }
  switch (run.conclusion) {
    case 'success':
      return 'Deployed';
    case 'failure':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'timed_out':
      return 'Timed out';
    default:
      return run.conclusion ?? 'Finished';
  }
}

const EVENT_LABELS: Record<string, string> = {
  push: 'Code change',
  repository_dispatch: 'From the admin',
  schedule: 'Daily build',
  workflow_dispatch: 'Manual run',
};

export const eventLabel = (event: string): string => EVENT_LABELS[event] ?? event;

/** Sentence for the author after an edit that changes the public site. */
export function triggerMessage(trigger: DeployTrigger | null): string | null {
  if (!trigger) return null;
  switch (trigger.status) {
    case 'started':
      return 'The public site is rebuilding; the change is online in a few minutes.';
    case 'not-configured':
      return 'The public site was not rebuilt automatically (GITHUB_REPO and GITHUB_TOKEN are not set). It updates with the next daily build.';
    case 'failed':
      return `The public site was not rebuilt: ${trigger.message} Use “Rebuild site” on the dashboard.`;
  }
}

/** Carries a trigger result across a page reload as `?deploy=<status>`. */
export const deployParam = (trigger: DeployTrigger | null): string =>
  trigger ? `deploy=${trigger.status}` : '';

/** Message for a `?deploy=` value; the failure detail is on the dashboard. */
export function messageFromParam(value: string | null): string | null {
  if (value === 'started' || value === 'not-configured') return triggerMessage({ status: value });
  if (value === 'failed') {
    return 'The public site was not rebuilt. Open the dashboard to see why and to try again.';
  }
  return null;
}
