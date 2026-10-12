import { z } from 'zod';

// Minimal GitHub REST client for the deploy workflow. The token is a fine-grained PAT limited to
// this repository with "Actions: read and write" and "Contents: read and write" (dispatches need
// the latter). It lives only in apps/admin/.env.

export const DEPLOY_WORKFLOW_FILE = 'deploy.yml';
export const CONTENT_CHANGED_EVENT = 'content-changed';

const API = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

export class GitHubApiError extends Error {
  override name = 'GitHubApiError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const runSchema = z.object({
  id: z.number(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  event: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  display_title: z.string().optional(),
});

const runsSchema = z.object({ workflow_runs: z.array(runSchema) });

const workflowSchema = z.object({
  id: z.number(),
  state: z.string(),
  html_url: z.string(),
});

export interface DeployRun {
  id: number;
  /** queued | in_progress | completed | waiting | requested | pending */
  status: string;
  /** success | failure | cancelled | skipped | timed_out | … ; null while running. */
  conclusion: string | null;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface DeployWorkflow {
  id: number;
  /** active | disabled_inactivity | disabled_manually | disabled_fork | deleted */
  state: string;
  url: string;
}

export interface GitHubClient {
  dispatchContentChanged(reason: string): Promise<void>;
  listDeployRuns(limit?: number): Promise<DeployRun[]>;
  getDeployWorkflow(): Promise<DeployWorkflow>;
  enableDeployWorkflow(): Promise<void>;
}

/** Turns HTTP failures into messages the author can act on, without echoing the token. */
function describeFailure(status: number, repo: string, body: string): string {
  if (status === 401) return 'GitHub rejected GITHUB_TOKEN: it is invalid or expired.';
  if (status === 403 || status === 404) {
    return `GITHUB_TOKEN cannot do this on ${repo}. Check that it covers this repository with "Actions: read and write" and "Contents: read and write".`;
  }
  if (status === 422) return `GitHub refused the request: ${body.slice(0, 200)}`;
  return `GitHub answered ${status}.`;
}

export function createGitHubClient(options: {
  repo: string;
  token: string;
  fetch?: typeof fetch;
}): GitHubClient {
  const { repo, token } = options;
  const doFetch = options.fetch ?? fetch;
  const workflowPath = `/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW_FILE}`;
  const missingWorkflow = `${repo} has no .github/workflows/${DEPLOY_WORKFLOW_FILE} on its default branch yet (or the token cannot see it). Push it first.`;

  async function request(
    method: string,
    path: string,
    body?: unknown,
    notFound?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${API}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new GitHubApiError(0, `Could not reach GitHub (${detail}).`);
    }
    if (response.status === 404 && notFound) throw new GitHubApiError(404, notFound);
    if (!response.ok) {
      throw new GitHubApiError(
        response.status,
        describeFailure(response.status, repo, await response.text()),
      );
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    async dispatchContentChanged(reason) {
      // The payload is visible in the public workflow logs: keep it to a short, generic reason.
      await request('POST', `/repos/${repo}/dispatches`, {
        event_type: CONTENT_CHANGED_EVENT,
        client_payload: { reason },
      });
    },

    async listDeployRuns(limit = 5) {
      const data = runsSchema.parse(
        await request('GET', `${workflowPath}/runs?per_page=${limit}`, undefined, missingWorkflow),
      );
      return data.workflow_runs.map((run) => ({
        id: run.id,
        status: run.status ?? 'unknown',
        conclusion: run.conclusion,
        event: run.event,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      }));
    },

    async getDeployWorkflow() {
      const data = workflowSchema.parse(
        await request('GET', workflowPath, undefined, missingWorkflow),
      );
      return { id: data.id, state: data.state, url: data.html_url };
    },

    async enableDeployWorkflow() {
      await request('PUT', `${workflowPath}/enable`, undefined, missingWorkflow);
    },
  };
}
