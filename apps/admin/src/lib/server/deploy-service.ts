import { findImageReferences, listPosts } from '@soy1limon/db/admin';
import { type DeployReason, type DeployTrigger, deployedSince, isLive } from '../deploy.ts';
import { adminEnv } from './env.ts';
import {
  createGitHubClient,
  type DeployRun,
  type DeployWorkflow,
  type GitHubClient,
} from './github.ts';
import { getDb } from './services.ts';

let client: GitHubClient | null | undefined;

/** GitHub client from the admin .env, or null when deploys are not configured. */
export function getGitHub(): GitHubClient | null {
  if (client !== undefined) return client;
  const env = adminEnv();
  client =
    env.GITHUB_REPO && env.GITHUB_TOKEN
      ? createGitHubClient({ repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN })
      : null;
  return client;
}

/** Asks GitHub to rebuild the public site. Never throws: the edit already succeeded. */
export async function requestRebuild(reason: DeployReason): Promise<DeployTrigger> {
  const github = getGitHub();
  if (!github) return { status: 'not-configured' };
  try {
    await github.dispatchContentChanged(reason);
    return { status: 'started' };
  } catch (error) {
    console.error(error);
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

/** Rebuilds only when the change is visible on the public site (before or after the edit). */
export async function rebuildIfLive(
  reason: DeployReason,
  ...states: ({ status: string; publishedAt: string | null } | null | undefined)[]
): Promise<DeployTrigger | null> {
  return states.some((state) => isLive(state)) ? requestRebuild(reason) : null;
}

/** True when any post that is online right now shows this image. */
export async function isImageLive(imageId: string): Promise<boolean> {
  const db = getDb();
  const [references, posts] = await Promise.all([findImageReferences(db, imageId), listPosts(db)]);
  const users = new Set([...references.coverOf, ...references.gallery, ...references.inline]);
  return posts.some((post) => users.has(post.id) && isLive(post));
}

export interface ScheduleCheck {
  state: string;
  url: string;
  /** True when this admin process found the daily build disabled for inactivity and re-enabled it. */
  reenabled: boolean;
}

let scheduleCheck: Promise<ScheduleCheck> | undefined;

/**
 * GitHub disables scheduled workflows after 60 days without repository activity. Checked once per
 * admin process (the first time the dashboard loads). A workflow disabled by hand stays disabled.
 */
function ensureDailyBuild(github: GitHubClient): Promise<ScheduleCheck> {
  scheduleCheck ??= (async () => {
    const workflow: DeployWorkflow = await github.getDeployWorkflow();
    if (workflow.state !== 'disabled_inactivity') return { ...workflow, reenabled: false };
    await github.enableDeployWorkflow();
    return { state: 'active', url: workflow.url, reenabled: true };
  })();
  // A failed check (network, token) is retried on the next load instead of being cached.
  scheduleCheck.catch(() => {
    scheduleCheck = undefined;
  });
  return scheduleCheck;
}

export type DeployOverview =
  | { configured: false }
  | {
      configured: true;
      repo: string;
      runs: DeployRun[];
      schedule: ScheduleCheck | null;
      error: string | null;
    };

export async function deployOverview(): Promise<DeployOverview> {
  const github = getGitHub();
  const repo = adminEnv().GITHUB_REPO;
  if (!github || !repo) return { configured: false };
  const [runs, schedule] = await Promise.allSettled([
    github.listDeployRuns(5),
    ensureDailyBuild(github),
  ]);
  const failure = [runs, schedule].find((result) => result.status === 'rejected');
  return {
    configured: true,
    repo,
    runs: runs.status === 'fulfilled' ? runs.value : [],
    schedule: schedule.status === 'fulfilled' ? schedule.value : null,
    error:
      failure?.status === 'rejected'
        ? failure.reason instanceof Error
          ? failure.reason.message
          : String(failure.reason)
        : null,
  };
}

/**
 * Retired image files may only go once the public site no longer points at them, i.e. after a
 * successful deploy that started after the image changed. Throws a readable reason otherwise.
 */
export async function assertRetiredFilesUnused(image: {
  id: string;
  updatedAt: string;
}): Promise<void> {
  if (!(await isImageLive(image.id))) return;
  const github = getGitHub();
  if (!github) return; // Without a token the check is impossible; the page explains the risk.
  const runs = await github.listDeployRuns(20);
  if (!deployedSince(runs, image.updatedAt)) {
    throw new Error(
      'The public site still uses these files: wait until a deploy that started after your last edit finishes (see the dashboard), then try again.',
    );
  }
}
