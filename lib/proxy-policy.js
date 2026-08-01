// @ts-check
// Shared proxy safety policy for the Vercel Function and local dev-server.

export const PROXY_ALLOWED_URL_PREFIXES = [
  'https://openrouter.ai/',
  'https://api.venice.ai/',
  'https://api.routstr.com/',
  'https://api.ppq.ai/',
  'https://api.ouraring.com/',
  'https://api.prod.whoop.com/',
  'https://partner.ultrahuman.com/',
  'https://wbsapi.withings.net/',
  'https://api.fitbit.com/',
  'https://www.polaraccesslink.com/',
  'https://polarremote.com/',
  'https://health.googleapis.com/',
  'https://oauth2.googleapis.com/',
];

export const PROXY_ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);
export const PROXY_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const PROXY_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PROXY_ALLOWED_HEADER_NAMES = new Set([
  'accept',
  'authorization',
  'content-type',
  'api-key',
  'x-api-key',
  'anthropic-version',
  'openai-organization',
  'openai-project',
  'http-referer',
  'x-title',
]);
const PROXY_BLOCKED_HEADER_NAMES = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function isProxyHostBlocked(host) {
  if (!host) return true;
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if ([
    '.home',
    '.internal',
    '.invalid',
    '.lan',
    '.local',
    '.localdomain',
    '.localhost',
    '.test',
  ].some(suffix => h.endsWith(suffix))) return true;
  if (h === '168.63.129.16') return true;
  if (h.includes(':')) {
    const lower = h.toLowerCase();
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    const v4Embed = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Embed) return isProxyHostBlocked(v4Embed[1]);
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice(7);
      const groups = tail.split(':');
      if (groups.length === 2 && groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) {
        const g0 = parseInt(groups[0], 16);
        const g1 = parseInt(groups[1], 16);
        const a = (g0 >> 8) & 0xff;
        const b = g0 & 0xff;
        const c = (g1 >> 8) & 0xff;
        const d = g1 & 0xff;
        return isProxyHostBlocked(`${a}.${b}.${c}.${d}`);
      }
    }
    const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(lower);
    if (sixToFour) {
      const g0 = parseInt(sixToFour[1], 16);
      const g1 = parseInt(sixToFour[2], 16);
      const a = (g0 >> 8) & 0xff;
      const b = g0 & 0xff;
      const c = (g1 >> 8) & 0xff;
      const d = g1 & 0xff;
      return isProxyHostBlocked(`${a}.${b}.${c}.${d}`);
    }
    return !/^[23][0-9a-f]{3}:/.test(lower);
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    if (octet.length > 1 && octet[0] === '0') return true;
    const n = +octet;
    if (n > 255) return true;
  }
  const a = +m[1], b = +m[2];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

export function isAllowedProxyUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (isProxyHostBlocked(u.hostname)) return false;
    if (PROXY_ALLOWED_URL_PREFIXES.some(prefix => u.href.startsWith(prefix))) return true;
    return true;
  } catch {
    return false;
  }
}

export function normalizeProxyMethod(method) {
  const normalized = String(method || 'POST').trim().toUpperCase();
  return PROXY_ALLOWED_METHODS.has(normalized) ? normalized : null;
}

export function sanitizeProxyHeaders(headers = {}) {
  if (headers == null) return { ok: true, headers: {} };
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    return { ok: false, error: 'Proxy headers must be an object' };
  }
  const out = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue == null) continue;
    const name = String(rawName || '').trim();
    const lower = name.toLowerCase();
    if (!name || !HEADER_NAME_RE.test(name)) return { ok: false, error: `Proxy header not allowed: ${name || '(empty)'}` };
    if (PROXY_BLOCKED_HEADER_NAMES.has(lower) || lower.startsWith('x-forwarded-')) {
      return { ok: false, error: `Proxy header not allowed: ${name}` };
    }
    if (!PROXY_ALLOWED_HEADER_NAMES.has(lower)) {
      return { ok: false, error: `Proxy header not allowed: ${name}` };
    }
    const value = String(rawValue);
    if (/[\r\n]/.test(value)) return { ok: false, error: `Proxy header has invalid value: ${name}` };
    out[name] = value;
  }
  return { ok: true, headers: out };
}
