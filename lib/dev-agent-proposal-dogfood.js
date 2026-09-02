import fs from 'node:fs';
import path from 'node:path';

const DOGFOOD_HEADER = 'agent-proposals-v1';
const TOKEN_RE = /^[a-f0-9]{64}$/u;
const CONTEXT_KEY_RE = /^gbctx_v1_[A-Za-z0-9_-]{43}$/u;
const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/u;

function parseEnvFile(text) {
  const values = Object.create(null);
  for (const raw of String(text || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
}

export function _readAgentProposalDogfoodEnvFile(filePath, { fsImpl = fs } = {}) {
  const fd = fsImpl.openSync(filePath, 'r');
  try {
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      throw new Error('Dogfood credential file must be a private regular file');
    }
    return fsImpl.readFileSync(fd, 'utf8').trim();
  } finally {
    fsImpl.closeSync(fd);
  }
}

export function _loadAgentProposalDogfoodCredentials({ env = process.env } = {}) {
  if (env.AGENT_PROPOSAL_DOGFOOD_ENABLED !== '1') return null;
  const envFile = String(env.AGENT_PROPOSAL_DOGFOOD_ENV_FILE || '');
  if (!path.isAbsolute(envFile)) return null;
  let values;
  try {
    values = parseEnvFile(_readAgentProposalDogfoodEnvFile(envFile));
  } catch {
    return null;
  }
  const token = values.GETBASED_TOKEN || '';
  const contextKey = values.GETBASED_AGENT_CONTEXT_KEY || '';
  const profileId = String(env.AGENT_PROPOSAL_DOGFOOD_PROFILE_ID || 'default');
  if (!TOKEN_RE.test(token) || !CONTEXT_KEY_RE.test(contextKey) || !PROFILE_ID_RE.test(profileId)) return null;
  return { version: 1, profileId, token, contextKey };
}

export function _handleAgentProposalDogfoodBootstrap(req, res, options = {}) {
  const credentials = _loadAgentProposalDogfoodCredentials(options);
  const header = String(req.headers?.['x-getbased-dogfood-bootstrap'] || '');
  if (req.method !== 'GET' || header !== DOGFOOD_HEADER || !credentials) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"agent_proposal_dogfood_disabled"}');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  });
  res.end(JSON.stringify(credentials));
}
