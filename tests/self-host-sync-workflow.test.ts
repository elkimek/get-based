import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Upstream Author',
      GIT_AUTHOR_EMAIL: 'upstream@example.com',
      GIT_COMMITTER_NAME: 'Upstream Author',
      GIT_COMMITTER_EMAIL: 'upstream@example.com',
    },
  }).trim();
}

function writeFiles(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

function extractSyncScript(): string {
  const workflow = fs.readFileSync('.github/workflows/sync-fork.yml', 'utf8');
  const marker = '        run: |\n';
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThan(0);
  const lines = workflow.slice(start + marker.length).split('\n');
  return lines.map(line => (line.startsWith('          ') ? line.slice(10) : line)).join('\n');
}

function runSync(env: Record<string, string>) {
  const script = extractSyncScript();
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
      IS_FORK: 'false',
      REPO: 'alice/my-getbased',
      REPO_OWNER: 'alice',
      REPO_OWNER_ID: '123456',
      GH_TOKEN: 'unused-local-token',
      DEPLOY_HOOK_URL: '',
      ...env,
    },
  });
}

describe('self-host clone CI guards', () => {
  it.each([
    ['.github/workflows/test.yml', 'prepare', true],
    ['.github/workflows/codeql.yml', 'analyze', true],
    ['.github/workflows/supply-chain.yml', 'validate', true],
    ['.github/workflows/sync-compat.yml', 'scope', false],
  ])('skips automatic clone runs in %s (%s)', (file, jobName, hasSchedule) => {
    const workflow = fs.readFileSync(file, 'utf8');
    const block = new RegExp(`^  ${jobName}:\\n([\\s\\S]*?)(?=^  [a-z_]+:|$(?![\\s\\S]))`, 'm').exec(workflow)?.[1];
    expect(block, `${file}:${jobName}`).toBeTruthy();
    const expr = /^    if: (.+)$/m.exec(block!)?.[1];
    expect(expr, `${file}:${jobName}.if`).toBeTruthy();
    const evalIf = (repository: string, event: string) =>
      Boolean(runInNewContext(expr!, { github: { repository, event_name: event }, inputs: { diagnostic: 'off' } }, { timeout: 100 }));

    expect(evalIf('elkimek/get-based', 'push')).toBe(true);
    expect(evalIf('elkimek/get-based', 'pull_request')).toBe(true);
    expect(evalIf('elkimek/get-based', 'workflow_dispatch')).toBe(true);
    expect(evalIf('user/my-getbased', 'push')).toBe(false);
    expect(evalIf('user/my-getbased', 'pull_request')).toBe(true);
    expect(evalIf('user/my-getbased', 'workflow_dispatch')).toBe(true);
    if (hasSchedule) {
      expect(evalIf('elkimek/get-based', 'schedule')).toBe(true);
      expect(evalIf('user/my-getbased', 'schedule')).toBe(false);
    }
  });
});

describe('sync-fork.yml standalone clone and workflow-safe updates', () => {
  it('syncs a squashed 1-click clone across upstream workflow edits, preserves custom wrangler name, stamps owner author, and stops on custom user edits', () => {
    const root = makeTempDir('getbased-sync-test-');
    const upstreamBare = path.join(root, 'upstream.git');
    const upstreamWork = path.join(root, 'upstream-work');
    const originBare = path.join(root, 'origin.git');
    const originWork = path.join(root, 'origin-work');
    const summaryFile = path.join(root, 'summary.md');

    git(root, ['init', '--bare', '--initial-branch=main', upstreamBare]);
    git(root, ['clone', upstreamBare, upstreamWork]);
    writeFiles(upstreamWork, {
      'app.txt': 'v1\n',
      'obsolete.txt': 'remove-me\n',
      'wrangler.jsonc': '{\n  "name": "get-based",\n  "compatibility_date": "2026-11-26"\n}\n',
      '.github/workflows/sync-fork.yml': 'name: Sync v1\n',
      '.github/workflows/test.yml': 'name: Tests v1\n',
    });
    git(upstreamWork, ['add', '-A']);
    git(upstreamWork, ['commit', '-m', 'Initial upstream v1']);
    git(upstreamWork, ['push', 'origin', 'HEAD:main']);

    // Simulate a 1-click Vercel/Cloudflare clone: brand-new unrelated git
    // history with a single initial commit and customized Cloudflare worker name.
    git(root, ['init', '--bare', '--initial-branch=main', originBare]);
    git(root, ['clone', originBare, originWork]);
    writeFiles(originWork, {
      'app.txt': 'v1\n',
      'obsolete.txt': 'remove-me\n',
      'wrangler.jsonc': '{\n  "name": "my-private-health",\n  "compatibility_date": "2026-11-26"\n}\n',
      '.github/workflows/sync-fork.yml': 'name: Sync v1\n',
      '.github/workflows/test.yml': 'name: Tests v1\n',
    });
    git(originWork, ['add', '-A']);
    git(originWork, ['commit', '-m', 'Initial commit']);
    git(originWork, ['push', 'origin', 'HEAD:main']);

    // Upstream lands v2 modifying app files, deleting a file, updating wrangler
    // compatibility_date, AND modifying .github/workflows/test.yml.
    writeFiles(upstreamWork, {
      'app.txt': 'v2\n',
      'wrangler.jsonc': '{\n  "name": "get-based",\n  "compatibility_date": "2026-12-01"\n}\n',
      '.github/workflows/test.yml': 'name: Tests v2\n',
    });
    fs.unlinkSync(path.join(upstreamWork, 'obsolete.txt'));
    git(upstreamWork, ['add', '-A']);
    git(upstreamWork, ['commit', '-m', 'Upstream v2 with workflow edit']);
    git(upstreamWork, ['push', 'origin', 'HEAD:main']);
    const upstreamV2 = git(upstreamWork, ['rev-parse', 'HEAD']);

    const firstSync = runSync({ ORIGIN_URL: originBare, UPSTREAM_URL: upstreamBare, GITHUB_STEP_SUMMARY: summaryFile });
    expect(firstSync.status, firstSync.stderr + firstSync.stdout).toBe(0);

    git(originWork, ['pull', '--ff-only', 'origin', 'main']);
    expect(fs.readFileSync(path.join(originWork, 'app.txt'), 'utf8')).toBe('v2\n');
    expect(fs.existsSync(path.join(originWork, 'obsolete.txt'))).toBe(false);
    // Custom Cloudflare Worker name preserved while compatibility_date updated.
    expect(fs.readFileSync(path.join(originWork, 'wrangler.jsonc'), 'utf8')).toBe(
      '{\n  "name": "my-private-health",\n  "compatibility_date": "2026-12-01"\n}\n',
    );
    // Workflows stayed untouched so GITHUB_TOKEN is never rejected.
    expect(fs.readFileSync(path.join(originWork, '.github/workflows/test.yml'), 'utf8')).toBe('name: Tests v1\n');
    // Author matches repo owner's verified GitHub noreply identity for Vercel Hobby.
    expect(git(originWork, ['log', '-1', '--format=%an <%ae>'])).toBe('alice <123456+alice@users.noreply.github.com>');
    expect(git(originWork, ['log', '-1', '--format=%B'])).toContain(`Upstream-Commit: ${upstreamV2}`);

    // Re-running with no new upstream changes is a clean no-op.
    const headAfterFirst = git(originWork, ['rev-parse', 'HEAD']);
    const noopSync = runSync({ ORIGIN_URL: originBare, UPSTREAM_URL: upstreamBare, GITHUB_STEP_SUMMARY: summaryFile });
    expect(noopSync.status, noopSync.stderr).toBe(0);
    git(originWork, ['pull', '--ff-only', 'origin', 'main']);
    expect(git(originWork, ['rev-parse', 'HEAD'])).toBe(headAfterFirst);

    // Upstream commit touching ONLY .github/workflows produces no empty rebuild commit.
    writeFiles(upstreamWork, { '.github/workflows/test.yml': 'name: Tests v3\n' });
    git(upstreamWork, ['add', '-A']);
    git(upstreamWork, ['commit', '-m', 'CI-only change']);
    git(upstreamWork, ['push', 'origin', 'HEAD:main']);
    const workflowOnlySync = runSync({ ORIGIN_URL: originBare, UPSTREAM_URL: upstreamBare, GITHUB_STEP_SUMMARY: summaryFile });
    expect(workflowOnlySync.status, workflowOnlySync.stderr).toBe(0);
    git(originWork, ['pull', '--ff-only', 'origin', 'main']);
    expect(git(originWork, ['rev-parse', 'HEAD'])).toBe(headAfterFirst);

    // Subsequent upstream app commit syncs cleanly on top of the previous sync commit.
    writeFiles(upstreamWork, { 'app.txt': 'v3\n' });
    git(upstreamWork, ['add', '-A']);
    git(upstreamWork, ['commit', '-m', 'Upstream v3']);
    git(upstreamWork, ['push', 'origin', 'HEAD:main']);
    const secondSync = runSync({ ORIGIN_URL: originBare, UPSTREAM_URL: upstreamBare, GITHUB_STEP_SUMMARY: summaryFile });
    expect(secondSync.status, secondSync.stderr).toBe(0);
    git(originWork, ['pull', '--ff-only', 'origin', 'main']);
    expect(fs.readFileSync(path.join(originWork, 'app.txt'), 'utf8')).toBe('v3\n');

    // If the user makes their own custom commit, auto-sync refuses to overwrite it.
    writeFiles(originWork, { 'app.txt': 'custom-user-edit\n' });
    git(originWork, ['add', '-A']);
    git(originWork, ['commit', '-m', 'My custom tweak']);
    git(originWork, ['push', 'origin', 'HEAD:main']);
    writeFiles(upstreamWork, { 'app.txt': 'v4\n' });
    git(upstreamWork, ['add', '-A']);
    git(upstreamWork, ['commit', '-m', 'Upstream v4']);
    git(upstreamWork, ['push', 'origin', 'HEAD:main']);

    const blockedSync = runSync({ ORIGIN_URL: originBare, UPSTREAM_URL: upstreamBare, GITHUB_STEP_SUMMARY: summaryFile });
    expect(blockedSync.status).toBe(1);
    git(originWork, ['pull', '--ff-only', 'origin', 'main']);
    expect(fs.readFileSync(path.join(originWork, 'app.txt'), 'utf8')).toBe('custom-user-edit\n');
  });
});
