// @ts-check
// Private, stable Agent Host state: pairing token and isolated Codex home.

import { randomBytes } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 256;
const SAFE_CODEX_CONFIG = '[analytics]\nenabled = false\n';

/** @param {string} token */
function validateToken(token) {
  const normalized = token.trim();
  if (normalized.length < MIN_TOKEN_LENGTH || normalized.length > MAX_TOKEN_LENGTH || /[\r\n]/.test(normalized)) {
    throw new Error('Agent Host token must contain 16–256 characters on one line.');
  }
  return normalized;
}

/** @param {NodeJS.ProcessEnv} source */
function defaultDataDirectory(source) {
  if (source.GETBASED_AGENT_HOST_DATA_DIR) {
    if (!isAbsolute(source.GETBASED_AGENT_HOST_DATA_DIR)) {
      throw new Error('GETBASED_AGENT_HOST_DATA_DIR must be an absolute path.');
    }
    return resolve(source.GETBASED_AGENT_HOST_DATA_DIR);
  }
  const dataRoot = source.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(dataRoot, 'getbased-agent-host');
}

/** @param {string} sourceAuth @param {string} targetAuth */
function refreshCodexAuth(sourceAuth, targetAuth) {
  if (!existsSync(sourceAuth)) {
    if (!existsSync(targetAuth)) throw new Error('Codex login was not found. Run `codex login` first.');
    return;
  }
  const shouldCopy = !existsSync(targetAuth) || statSync(sourceAuth).mtimeMs > statSync(targetAuth).mtimeMs;
  if (shouldCopy) copyFileSync(sourceAuth, targetAuth);
  chmodSync(targetAuth, 0o600);
}

/**
 * @param {{env?: NodeJS.ProcessEnv, randomToken?: () => string}} [options]
 */
export function prepareAgentHostStorage(options = {}) {
  const env = options.env || process.env;
  const dataDirectory = defaultDataDirectory(env);
  const codexHome = join(dataDirectory, 'codex');
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  chmodSync(dataDirectory, 0o700);
  chmodSync(codexHome, 0o700);

  const sourceCodexHome = env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homedir(), '.codex');
  refreshCodexAuth(join(sourceCodexHome, 'auth.json'), join(codexHome, 'auth.json'));
  writeFileSync(join(codexHome, 'config.toml'), SAFE_CODEX_CONFIG, { mode: 0o600 });

  const tokenPath = join(dataDirectory, 'pairing-token');
  let token;
  if (env.GETBASED_AGENT_HOST_TOKEN) {
    token = validateToken(env.GETBASED_AGENT_HOST_TOKEN);
  } else if (existsSync(tokenPath)) {
    token = validateToken(readFileSync(tokenPath, 'utf8'));
  } else {
    token = validateToken(options.randomToken?.() || randomBytes(32).toString('base64url'));
    try {
      writeFileSync(tokenPath, `${token}\n`, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (!existsSync(tokenPath)) throw error;
      token = validateToken(readFileSync(tokenPath, 'utf8'));
    }
  }
  if (existsSync(tokenPath)) chmodSync(tokenPath, 0o600);
  return { dataDirectory, codexHome, token };
}
