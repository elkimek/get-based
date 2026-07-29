// @ts-check

import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CATALOG_BODY_BYTES = 5 * 1024 * 1024;

/** @typedef {{ skipped: boolean, reason?: string, error?: string, committed?: boolean, pushed?: boolean, sha?: string | null }} CatalogGitResult */
/** @typedef {{ skipped?: boolean, reason?: string, error?: string, triggered?: boolean, jobId?: string | null }} CatalogVercelResult */

// Mutex for /api/deploy-catalog so two concurrent POSTs cannot race on
// the read-hash → writeFileSync critical section.
let deployLock = Promise.resolve();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function _isValidCatalogShape(parsed) {
  return !!(
    parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && parsed.slots
    && parsed.products
  );
}

export function deployCatalog(body, req, res) {
  deployLock = deployLock.then(async () => {
    try {
      const parsed = JSON.parse(body);
      if (!_isValidCatalogShape(parsed)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid catalog shape: missing required slots/products keys');
        return;
      }
      const filePath = path.join(ROOT, 'data', 'recommendations.json');
      const ifMatch = req.headers['if-match'];
      if (ifMatch) {
        let currentHash = '';
        try {
          const buf = fs.readFileSync(filePath);
          currentHash = crypto.createHash('sha256').update(buf).digest('hex');
        } catch {}
        if (currentHash && currentHash !== ifMatch.replace(/"/g, '')) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'conflict', currentHash }));
          return;
        }
      }
      fs.writeFileSync(filePath, body);
      const newHash = crypto.createHash('sha256').update(body).digest('hex');

      // Post-write hooks are best effort. The catalog is already deployed
      // locally if either the git publish or Vercel trigger fails.
      const hooks = await _runPostDeployHooks(filePath).catch(error => ({
        git: { skipped: true, error: `hook crash: ${errorMessage(error)}` },
        vercel: { skipped: true },
      }));

      res.writeHead(200, { 'Content-Type': 'application/json', 'ETag': `"${newHash}"` });
      res.end(JSON.stringify({ ok: true, hash: newHash, ...hooks }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Invalid JSON: ${errorMessage(error)}`);
    }
  }).catch(() => {});
  return deployLock;
}

export function handleCatalogDeployRequest(req, res) {
  let body = '';
  let bytes = 0;
  let aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > MAX_CATALOG_BODY_BYTES) {
      aborted = true;
      res.writeHead(413, { 'Content-Type': 'text/plain' });
      res.end('Catalog body exceeds 5 MB limit');
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    if (!aborted) deployCatalog(body, req, res);
  });
}

// Resolve which git repo to push the catalog from. The symlink at
// data/recommendations.json typically points into a sibling repo
// (getbased-tools); we want to commit there, not in the app repo.
export function _resolveCatalogRepo(filePath, opts = {}) {
  const override = opts.envRepo ?? process.env.CATALOG_GIT_REPO;
  const appRoot = opts.appRoot ?? ROOT;
  const fsImpl = opts.fs ?? fs;
  const execFileImpl = opts.execFile ?? execFile;
  const realpath = (candidate) => {
    try { return fsImpl.realpathSync(candidate); } catch { return candidate; }
  };
  return new Promise((resolve) => {
    let repoRoot;
    let target;
    if (override) {
      repoRoot = path.resolve(override);
      target = realpath(filePath);
    } else {
      target = realpath(filePath);
      const targetDir = path.dirname(target);
      const appReal = realpath(appRoot);
      if (targetDir === path.join(appReal, 'data')) {
        resolve(null);
        return;
      }
      execFileImpl('git', ['-C', targetDir, 'rev-parse', '--show-toplevel'], { timeout: 3000 }, (err, out) => {
        if (err) { resolve(null); return; }
        const root = String(out).trim();
        if (!root) { resolve(null); return; }
        resolve({ repoRoot: root, relPath: path.relative(root, target) });
      });
      return;
    }
    execFileImpl('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], { timeout: 3000 }, (err, out) => {
      if (err) { resolve(null); return; }
      const root = String(out).trim();
      const rel = path.relative(root, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) { resolve(null); return; }
      resolve({ repoRoot: root, relPath: rel });
    });
  });
}

// Best-effort post-deploy hooks: git commit+push, then Vercel deploy hook.
// Each result is returned to the editor and this function never throws.
export async function _runPostDeployHooks(filePath, opts = {}) {
  const env = opts.env ?? process.env;
  const execFileImpl = opts.execFile ?? execFile;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const fsImpl = opts.fs ?? fs;
  const appRoot = opts.appRoot ?? ROOT;
  /** @type {{ git: CatalogGitResult, vercel: CatalogVercelResult }} */
  const out = { git: { skipped: true }, vercel: { skipped: true } };

  const target = await _resolveCatalogRepo(filePath, {
    envRepo: env.CATALOG_GIT_REPO,
    execFile: execFileImpl,
    fs: fsImpl,
    appRoot,
  });
  if (!target) {
    out.git = { skipped: true, reason: 'CATALOG_GIT_REPO not set and catalog file is not a symlink to another repo' };
  } else {
    out.git = await gitCommitAndPush(target, execFileImpl, env);
  }

  const hookUrl = env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    out.vercel = { skipped: true, reason: 'VERCEL_DEPLOY_HOOK_URL not set' };
  } else if (!/^https:\/\/api\.vercel\.com\/v[0-9]+\/integrations\/deploy\//.test(hookUrl)) {
    out.vercel = { skipped: true, reason: 'VERCEL_DEPLOY_HOOK_URL does not look like a Vercel deploy hook' };
  } else if (out.git.skipped || out.git.error || out.git.pushed !== true) {
    const reason = out.git.error
      ? 'skipped because git push failed'
      : out.git.committed === false
        ? 'skipped because no catalog changes were committed'
        : 'skipped because catalog was not pushed';
    out.vercel = { skipped: true, reason };
  } else {
    try {
      const response = await fetchImpl(hookUrl, { method: 'POST' });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        out.vercel = { triggered: false, error: `Vercel hook returned ${response.status}: ${text.slice(0, 200)}` };
      } else {
        const payload = await response.json().catch(() => ({}));
        const jobId = payload && typeof payload === 'object' && 'job' in payload
          && payload.job && typeof payload.job === 'object' && 'id' in payload.job
          ? String(payload.job.id)
          : null;
        out.vercel = { triggered: true, jobId };
      }
    } catch (error) {
      out.vercel = { triggered: false, error: errorMessage(error) };
    }
  }

  return out;
}

function execGit(cwd, args, execFileImpl, opts = {}) {
  return new Promise((resolve) => {
    execFileImpl('git', ['-C', cwd, ...args], { timeout: opts.timeout ?? 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), err });
    });
  });
}

async function gitCommitAndPush(target, execFileImpl, env) {
  const { repoRoot, relPath } = target;
  const message = env.CATALOG_COMMIT_MSG || 'catalog: deploy from editor';

  const add = await execGit(repoRoot, ['add', '--', relPath], execFileImpl);
  if (add.err) return { skipped: false, error: `git add failed: ${add.stderr || add.err.message}` };

  const diff = await execGit(repoRoot, ['diff', '--cached', '--quiet', '--', relPath], execFileImpl);
  if (diff.code === 0) {
    const head = await execGit(repoRoot, ['rev-parse', 'HEAD'], execFileImpl);
    return {
      skipped: false,
      committed: false,
      pushed: false,
      sha: head.stdout.trim() || null,
      reason: 'no catalog changes to commit',
    };
  }

  const commit = await execGit(repoRoot, ['commit', '-m', message, '--', relPath], execFileImpl);
  if (commit.err) return { skipped: false, error: `git commit failed: ${commit.stderr || commit.err.message}` };

  const sha = (await execGit(repoRoot, ['rev-parse', 'HEAD'], execFileImpl)).stdout.trim();
  const push = await execGit(repoRoot, ['push', 'origin', 'HEAD'], execFileImpl, { timeout: 60_000 });
  if (push.err) {
    return {
      skipped: false,
      committed: true,
      pushed: false,
      sha,
      error: `git push failed: ${(push.stderr || push.err.message).slice(0, 400)}`,
    };
  }
  return { skipped: false, committed: true, pushed: true, sha };
}
