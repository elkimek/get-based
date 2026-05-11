#!/usr/bin/env node
// Fetch data/recommendations.json from a private source at build time.
//
// Local dev: data/recommendations.json is typically a symlink to the
// maintainer's catalog source. This script does nothing if that symlink
// resolves to a real file (the existing local content is already correct).
//
// Production (Vercel): set two env vars:
//   CATALOG_FETCH_URL    — full https URL to the JSON file. For private
//                          GitHub repos use the API URL, NOT raw.githubusercontent.com:
//                            https://api.github.com/repos/OWNER/REPO/contents/PATH?ref=BRANCH
//                          (raw.githubusercontent.com returns HTTP 404 for
//                          private content even with a valid Bearer token.)
//   CATALOG_FETCH_TOKEN  — token with read access to that URL
//                          (e.g. GitHub fine-grained PAT, contents:read scope)
//
// On a successful fetch the script overwrites data/recommendations.json.
// On any failure (missing env, network error, non-2xx response, JSON
// parse failure), the script EXITS NON-ZERO so the build fails loudly
// rather than shipping a stale or empty catalog.
//
// Optional CATALOG_FETCH_HEADER lets you override the auth header style
// (default: `Authorization: Bearer ${TOKEN}`). For GitHub raw URLs you
// usually don't need to override.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TARGET = path.join(ROOT, 'data', 'recommendations.json');

const url = process.env.CATALOG_FETCH_URL;
const token = process.env.CATALOG_FETCH_TOKEN;

// Replace TARGET safely whether it's missing, a regular file, or a
// (possibly dangling) symlink. fs.writeFileSync follows symlinks, which
// fails when the symlink target doesn't exist on this machine — so we
// detect symlinks via lstat (non-dereferencing) and unlink them first.
function _replaceTarget(content) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  try {
    const lst = fs.lstatSync(TARGET);
    if (lst.isSymbolicLink()) fs.unlinkSync(TARGET);
  } catch { /* ENOENT is fine — nothing to remove */ }
  fs.writeFileSync(TARGET, content);
}

// No env vars set: assume local dev. Verify the existing file/symlink is
// readable. If broken (e.g. fork without the upstream symlink target,
// or CI without secrets), fall back to the example stub.
if (!url) {
  try {
    const buf = fs.readFileSync(TARGET);
    JSON.parse(buf);
    console.log(`[fetch-catalog] Skipped (no CATALOG_FETCH_URL); local file OK (${buf.length} bytes).`);
    process.exit(0);
  } catch (e) {
    const stub = path.join(ROOT, 'data', 'recommendations.example.json');
    if (fs.existsSync(stub)) {
      const stubContent = fs.readFileSync(stub);
      _replaceTarget(stubContent);
      console.log(`[fetch-catalog] Local file unreadable; copied example stub → ${TARGET}.`);
      process.exit(0);
    }
    console.error(`[fetch-catalog] No CATALOG_FETCH_URL set AND local data/recommendations.json is unreadable AND no example stub. Aborting.`);
    process.exit(1);
  }
}

if (!token) {
  // Vercel doesn't expose secrets to feature-branch / PR builds by
  // default (security guard against fork-author exfiltration). The
  // URL var is project-level config, so it lands; the TOKEN is
  // secret, so it doesn't. Without it we can't auth the catalog
  // fetch — but a PR preview doesn't NEED the real catalog, the
  // example stub is enough for the preview deploy to succeed and
  // surface UI changes. Production builds (main / VERCEL_ENV=
  // production) have both env vars set and never reach this branch.
  const stub = path.join(ROOT, 'data', 'recommendations.example.json');
  if (fs.existsSync(stub)) {
    const stubContent = fs.readFileSync(stub);
    _replaceTarget(stubContent);
    console.log(`[fetch-catalog] CATALOG_FETCH_TOKEN missing (PR preview?); using example stub → ${TARGET}.`);
    process.exit(0);
  }
  console.error('[fetch-catalog] CATALOG_FETCH_URL is set but CATALOG_FETCH_TOKEN is missing AND no example stub. Aborting.');
  process.exit(1);
}

const headerName = process.env.CATALOG_FETCH_HEADER_NAME || 'Authorization';
const headerValue = process.env.CATALOG_FETCH_HEADER_VALUE || `Bearer ${token}`;

// Helpful warning: raw.githubusercontent.com URLs return 404 for private
// repos even with a valid Bearer token. Convert to the equivalent API URL
// silently so the user doesn't have to debug this themselves.
let effectiveUrl = url;
const rawMatch = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
if (rawMatch) {
  const [, owner, repo, ref, p] = rawMatch;
  effectiveUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${ref}`;
  console.log(`[fetch-catalog] Rewrote raw.githubusercontent.com URL to GitHub Contents API (works with private-repo PATs).`);
}

try {
  const res = await fetch(effectiveUrl, {
    headers: {
      [headerName]: headerValue,
      // GitHub Contents API returns the file body when this Accept header is sent.
      'Accept': 'application/vnd.github.v3.raw, application/vnd.github.raw, application/octet-stream',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[fetch-catalog] HTTP ${res.status} from ${effectiveUrl} — ${body.slice(0, 200)}`);
    process.exit(1);
  }
  const text = await res.text();
  // Validate JSON before writing — never ship a half-baked file.
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    console.error(`[fetch-catalog] Response was not valid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.slots || !parsed.products) {
    console.error('[fetch-catalog] Response missing required catalog shape (slots / products keys).');
    process.exit(1);
  }
  _replaceTarget(text);
  const counts = {
    slots: Object.keys(parsed.slots || {}).length,
    products: Object.values(parsed.products || {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0),
    vendors: Object.keys(parsed.vendors || {}).length,
  };
  console.log(`[fetch-catalog] OK — ${text.length} bytes, ${counts.slots} slots, ${counts.products} products, ${counts.vendors} vendors → ${TARGET}`);
} catch (e) {
  console.error(`[fetch-catalog] Network / runtime error: ${e.message}`);
  process.exit(1);
}
