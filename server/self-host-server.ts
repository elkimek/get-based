import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SELF_HOST_BIND = '127.0.0.1';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SECURITY_HEADERS = [
  'Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options',
  'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy',
] as const;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

export function selfHostPort(value = '8000'): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('GETBASED_SELF_HOST_PORT must be a port from 1 to 65535.');
  }
  return Number(value);
}

const TAILSCALE_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.ts\.net$/;

export function isAllowedSelfHostHeader(hostHeader: string | undefined, boundPort: number | null): boolean {
  if (typeof hostHeader !== 'string' || !hostHeader || /[\s/\\@]/.test(hostHeader)) return false;
  const normalized = hostHeader.toLowerCase();
  let hostname = normalized;
  let port: number | null = null;
  if (normalized.startsWith('[')) {
    const close = normalized.indexOf(']');
    if (close < 0) return false;
    hostname = normalized.slice(0, close + 1);
    const rest = normalized.slice(close + 1);
    if (rest) {
      if (!/^:\d{1,5}$/.test(rest)) return false;
      port = Number(rest.slice(1));
    }
  } else {
    const colon = normalized.lastIndexOf(':');
    if (colon >= 0) {
      const portPart = normalized.slice(colon + 1);
      if (!/^\d{1,5}$/.test(portPart)) return false;
      hostname = normalized.slice(0, colon);
      port = Number(portPart);
    }
  }
  if (port !== null && (port < 1 || port > 65535)) return false;
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]') {
    return port === null || boundPort === null || port === boundPort;
  }
  if (TAILSCALE_HOST.test(hostname)) {
    return port === null || port === 443 || (boundPort !== null && port === boundPort);
  }
  return false;
}

/** Serve the assembled public app only. This is not a data or integration API. */
export async function createSelfHostServer(options: {
  artifactDirectory?: string; deploymentFile?: string;
} = {}): Promise<http.Server> {
  const directory = await fs.realpath(options.artifactDirectory ?? path.join(ROOT, 'dist'));
  for (const required of ['index.html', 'version.js', 'service-worker.js', 'build-metrics.json']) {
    const stat = await fs.lstat(path.join(directory, required));
    if (!stat.isFile()) throw new Error('Build the production app with npm run production:build first.');
  }
  const deployment = JSON.parse(await fs.readFile(options.deploymentFile ?? path.join(ROOT, 'vercel.json'), 'utf8')) as {
    routes?: Array<{headers?: Record<string, string>}>;
  };
  const headers: Record<string, string> = {};
  for (const name of SECURITY_HEADERS) {
    const value = deployment.routes?.map(route => route.headers?.[name]).find(Boolean);
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('Missing or invalid deployment security header: ' + name);
    headers[name] = value;
  }

  // Only inventoried public files can be requested. Never expose the checkout,
  // environment files, symlinks, or private directories alongside the artifact.
  const files = new Map<string, string>();
  async function inventory(relative = ''): Promise<void> {
    for (const entry of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
      if (entry.name.startsWith('.') && !(relative === '' && entry.name === '.well-known')) continue;
      if (relative === '' && (entry.name === '_headers' || entry.name === '_redirects')) continue;
      if (entry.isSymbolicLink()) throw new Error('The public artifact must not contain symbolic links.');
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await inventory(name);
      else if (entry.isFile()) files.set('/' + name, path.join(directory, ...name.split('/')));
    }
  }
  await inventory();
  const server = http.createServer((request, response) => {
    void (async () => {
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      response.setHeader('Cache-Control', 'no-store');
      const addr = server.address();
      const boundPort = addr && typeof addr === 'object' ? addr.port : null;
      if (!isAllowedSelfHostHeader(request.headers.host, boundPort)) {
        response.writeHead(421); response.end('Invalid host'); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD'); response.writeHead(405); response.end('Method not allowed'); return;
      }
      let pathname: string;
      try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
      catch { response.writeHead(400); response.end('Invalid URL'); return; }
      if (['/', '/app', '/app/'].includes(pathname)) pathname = '/index.html';
      const file = files.get(pathname);
      if (!file) { response.writeHead(404); response.end('Not found'); return; }
      // Check again after startup so replacing a file with a symlink cannot
      // expose files outside dist, including through an ancestor symlink.
      const real = await fs.realpath(file);
      if (real !== file) { response.writeHead(404); response.end('Not found'); return; }
      const body = await fs.readFile(real);
      if (pathname === '/app/migration.html') {
        response.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
      }
      response.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
      response.setHeader('Content-Length', body.length);
      response.end(request.method === 'HEAD' ? undefined : body);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(404);
      response.end('Not found');
    });
  });
  return server;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log('Usage: getbased [--help | --version]\nStarts the production app at http://127.0.0.1:8000/app.\nKeep this terminal running. Press Ctrl+C to stop.\nFor private HTTPS: tailscale serve --bg http://127.0.0.1:8000\nChoose the HTTPS address before restoring browser data.\nSet GETBASED_SELF_HOST_PORT to use another fixed port.'); return;
  }
  if (args.length === 1 && ['--version', '-v'].includes(args[0]!)) {
    const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')) as {version: string};
    console.log(manifest.version); return;
  }
  if (args.length) throw new Error('Unknown option. Run getbased --help.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor! < 20) throw new Error('getbased requires Node.js 24.20 or later within version 24.');
  const port = selfHostPort(process.env.GETBASED_SELF_HOST_PORT);
  let server: http.Server;
  try { server = await createSelfHostServer(); }
  catch { throw new Error('Could not load the public app. Run npm run production:build, then try npm run self-host again.'); }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, SELF_HOST_BIND, resolve);
  });
  console.log('getbased is running at http://' + SELF_HOST_BIND + ':' + port + '/app');
  console.log('For private HTTPS, run in another terminal: tailscale serve --bg http://' + SELF_HOST_BIND + ':' + port);
  console.log('Use the HTTPS address Tailscale prints on all your devices. Keep this process running.');
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

if (process.argv[1]
  && await fs.realpath(process.argv[1]).catch(() => null) === await fs.realpath(fileURLToPath(import.meta.url)).catch(() => fileURLToPath(import.meta.url))) {
  void main().catch(error => {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(code === 'EADDRINUSE'
      ? 'The local port is already in use. Stop the other getbased process or set GETBASED_SELF_HOST_PORT before starting.'
      : error instanceof Error ? error.message : 'Could not start getbased.');
    process.exitCode = 1;
  });
}
