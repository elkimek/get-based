// Private, stable Agent Host state: pairing token and isolated Codex home.

import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface AgentHostStorageOptions {
  env?: NodeJS.ProcessEnv;
  randomToken?: () => string;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  requireCodexAuth?: boolean;
}

const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 256;
const SAFE_CODEX_CONFIG = '[analytics]\nenabled = false\n';

function validateToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < MIN_TOKEN_LENGTH || normalized.length > MAX_TOKEN_LENGTH || /[\r\n]/.test(normalized)) {
    throw new Error('Agent Host token must contain 16–256 characters on one line.');
  }
  return normalized;
}

function defaultDataDirectory(source: NodeJS.ProcessEnv, platform: NodeJS.Platform, homeDirectory: string) {
  if (source.GETBASED_AGENT_HOST_DATA_DIR) {
    if (!isAbsolute(source.GETBASED_AGENT_HOST_DATA_DIR)) {
      throw new Error('GETBASED_AGENT_HOST_DATA_DIR must be an absolute path.');
    }
    return resolve(source.GETBASED_AGENT_HOST_DATA_DIR);
  }
  const dataRoot = source.XDG_DATA_HOME
    || (platform === 'win32' && source.LOCALAPPDATA)
    || (platform === 'darwin' ? join(homeDirectory, 'Library', 'Application Support') : '')
    || join(homeDirectory, '.local', 'share');
  return join(dataRoot, 'getbased-agent-host');
}

function replacePrivateFile(destination: string, value: string | Buffer) {
  const temporary = `${destination}.${randomBytes(8).toString('hex')}`;
  try {
    writeFileSync(temporary, value, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, destination);
  } finally { rmSync(temporary, { force: true }); }
}

function refreshCodexAuth(sourceAuth: string, targetAuth: string) {
  const sourceDigestPath = `${targetAuth}.source-sha256`;
  let auth: Buffer;
  try {
    auth = readFileSync(sourceAuth);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    rmSync(targetAuth, { force: true });
    rmSync(sourceDigestPath, { force: true });
    throw new Error('Codex login was not found. Run `codex login` first.');
  }
  const digest = createHash('sha256').update(auth).digest('hex');
  let previous = '';
  try { previous = readFileSync(sourceDigestPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!existsSync(targetAuth) || previous !== digest) {
    replacePrivateFile(targetAuth, auth);
    replacePrivateFile(sourceDigestPath, digest);
  }
  chmodSync(targetAuth, 0o600);
}

export function prepareAgentHostStorage(options: AgentHostStorageOptions = {}) {
  const env = options.env || process.env;
  const homeDirectory = options.homeDirectory || homedir();
  const dataDirectory = defaultDataDirectory(env, options.platform || process.platform, homeDirectory);
  const codexHome = join(dataDirectory, 'codex');
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  chmodSync(dataDirectory, 0o700);
  chmodSync(codexHome, 0o700);

  const sourceCodexHome = env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homeDirectory, '.codex');
  let codexAuthenticated = false;
  try {
    refreshCodexAuth(join(sourceCodexHome, 'auth.json'), join(codexHome, 'auth.json'));
    codexAuthenticated = true;
  } catch (error) {
    if (options.requireCodexAuth !== false) throw error;
  }
  writeFileSync(join(codexHome, 'config.toml'), SAFE_CODEX_CONFIG, { mode: 0o600 });

  const tokenPath = join(dataDirectory, 'pairing-token');
  let token;
  if (env.GETBASED_AGENT_HOST_TOKEN) {
    token = validateToken(env.GETBASED_AGENT_HOST_TOKEN);
  } else {
    try {
      token = validateToken(readFileSync(tokenPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      token = validateToken(options.randomToken?.() || randomBytes(32).toString('base64url'));
      try {
        writeFileSync(tokenPath, `${token}\n`, { mode: 0o600, flag: 'wx' });
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        token = validateToken(readFileSync(tokenPath, 'utf8'));
      }
    }
  }
  if (existsSync(tokenPath)) chmodSync(tokenPath, 0o600);
  return { dataDirectory, codexHome, token, codexAuthenticated };
}
