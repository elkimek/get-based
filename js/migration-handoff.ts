import {isPublicDemoOrigin} from '../shared/hosted-transition.js';

export const VERCEL_DEPLOY_URL = 'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felkimek%2Fget-based&project-name=my-getbased&repository-name=my-getbased';
export const CLOUDFLARE_DEPLOY_URL = 'https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Felkimek%2Fget-based';

const OFFICIAL_HOSTED_ORIGINS = new Set([
  'https://app.getbased.health',
  'https://getbased.health',
  'https://www.getbased.health',
  'https://get-based.vercel.app',
  'http://iobqafpywmncin7m2wpvbemouvulaeb7jnvtvugxnru4gpneushb5jyd.onion',
]);

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

function canonicalOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter your new self-hosted getbased URL.');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : (/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`);
  let url: URL;
  try { url = new URL(withScheme); } catch { throw new Error('Enter a valid URL such as https://my-getbased.vercel.app.'); }
  url.hostname = url.hostname.replace(/\.$/, '');
  const loopback = isLoopbackHost(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Your new self-hosted address must use https:// (or http:// on localhost/127.0.0.1).');
  }
  return url.origin;
}

export function normalizeDestinationOrigin(rawUrl: string, currentOrigin = typeof location !== 'undefined' ? location.origin : ''): string {
  const target = canonicalOrigin(rawUrl);
  let current = '';
  try {
    const parsed = new URL(currentOrigin);
    parsed.hostname = parsed.hostname.replace(/\.$/, '');
    current = parsed.origin;
  } catch { /* ignore */ }
  if (current && target === current) {
    throw new Error('Enter your new self-hosted address, not this current URL.');
  }
  if (OFFICIAL_HOSTED_ORIGINS.has(target) || isPublicDemoOrigin(target)) {
    throw new Error('Enter your own Vercel, Cloudflare, or local self-hosted URL — not the official hosted or demo address.');
  }
  return target;
}

export function isAllowedHandoffSourceOrigin(origin: string): boolean {
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  url.hostname = url.hostname.replace(/\.$/, '');
  if (OFFICIAL_HOSTED_ORIGINS.has(url.origin)) return true;
  return (url.protocol === 'http:' || url.protocol === 'https:') && isLoopbackHost(url.hostname.toLowerCase());
}

export function generateEphemeralTransferPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateHandoffNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface IncomingHandoffParams {
  nonce: string;
  sourceOrigin: string;
}

export function parseHandoffFragment(hash = typeof location !== 'undefined' ? location.hash : ''): IncomingHandoffParams | null {
  const clean = hash.replace(/^#/, '');
  if (!clean) return null;
  const params = new URLSearchParams(clean);
  const nonce = params.get('handoff') || '';
  const sourceOrigin = params.get('source') || '';
  if (!/^[a-f0-9]{32}$/.test(nonce) || !isAllowedHandoffSourceOrigin(sourceOrigin)) return null;
  return {nonce, sourceOrigin};
}

export function readReturnedDeploymentUrl(search = typeof location !== 'undefined' ? location.search : ''): string {
  try {
    const params = new URLSearchParams(search);
    const returned = params.get('deployment-url') || params.get('destination') || '';
    if (!returned) return '';
    return normalizeDestinationOrigin(returned);
  } catch {
    return '';
  }
}

export function buildHandoffTargetUrl(destinationOrigin: string, nonce: string, sourceOrigin = location.origin): string {
  return `${destinationOrigin}/app/migration.html#handoff=${encodeURIComponent(nonce)}&source=${encodeURIComponent(sourceOrigin)}`;
}

export interface HandoffDeliverySession {
  destinationOrigin: string;
  nonce: string;
  deliver(archiveBlob: Blob, ephemeralPassword: string, onStatus?: (status: string) => void): Promise<void>;
  cancel(): void;
}

/**
 * Opens the destination tab synchronously inside a user click gesture so
 * browsers never block the popup while the encrypted archive is being built.
 */
export function startHandoffSession(destinationOrigin: string, sourceOrigin = location.origin): HandoffDeliverySession {
  const nonce = generateHandoffNonce();
  const targetUrl = buildHandoffTargetUrl(destinationOrigin, nonce, sourceOrigin);
  const destWindow = globalThis.open(targetUrl, '_blank');
  if (!destWindow) {
    throw new Error('Your browser blocked opening the new tab. Allow pop-ups for this site and click Move my data automatically again.');
  }

  let destinationReady = false;
  let acked = false;
  let closed = false;
  let onReadyCallback: (() => void) | null = null;
  let onAckCallback: (() => void) | null = null;

  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== destinationOrigin || event.source !== destWindow) return;
    const data = event.data as {type?: unknown; nonce?: unknown} | null;
    if (!data || typeof data !== 'object' || data.nonce !== nonce) return;
    if (data.type === 'getbased-migration-ready') {
      destinationReady = true;
      onReadyCallback?.();
    } else if (data.type === 'getbased-migration-ack') {
      acked = true;
      onAckCallback?.();
    }
  };
  globalThis.addEventListener('message', handleMessage);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    globalThis.removeEventListener('message', handleMessage);
    onReadyCallback = null;
    onAckCallback = null;
  };

  return {
    destinationOrigin,
    nonce,
    cancel() {
      cleanup();
      try { if (!destWindow.closed) destWindow.close(); } catch { /* ignore */ }
    },
    async deliver(archiveBlob: Blob, ephemeralPassword: string, onStatus?: (status: string) => void) {
      try {
        onStatus?.('Waiting for your new getbased tab to connect…');
        if (!destinationReady) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              clearInterval(pollClosed);
              reject(new Error('Your new tab did not connect in time. Make sure your deployment finished building and uses the latest version, or use Manual file transfer below.'));
            }, 60000);
            const pollClosed = setInterval(() => {
              if (destWindow.closed) {
                clearTimeout(timeout);
                clearInterval(pollClosed);
                reject(new Error('The new getbased tab was closed before transfer finished. Your data here is untouched.'));
              }
            }, 400);
            onReadyCallback = () => {
              clearTimeout(timeout);
              clearInterval(pollClosed);
              resolve();
            };
          });
        }
        onStatus?.('Sending encrypted archive directly to your new tab…');
        const buffer = await archiveBlob.arrayBuffer();
        const waitAck = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Transfer confirmation timed out. Check the new tab — if your data did not appear, try again or use Manual file transfer below.'));
          }, 20000);
          onAckCallback = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
        destWindow.postMessage(
          {type: 'getbased-migration-payload', nonce, buffer, password: ephemeralPassword},
          destinationOrigin,
          [buffer],
        );
        if (!acked) await waitAck;
        try { destWindow.focus(); } catch { /* ignore */ }
      } finally {
        cleanup();
      }
    },
  };
}

export interface ReceivedHandoffPayload {
  blob: Blob;
  password: string;
  sourceOrigin: string;
}

/**
 * Runs on the destination tab when opened with #handoff=<nonce>&source=<origin>.
 * Sends strict origin-pinned readiness pings to the opener tab and resolves once
 * the encrypted archive buffer + ephemeral password arrive.
 */
export function receiveHandoffPayload(params: IncomingHandoffParams, timeoutMs = 90000): Promise<ReceivedHandoffPayload> {
  const opener = (globalThis as typeof globalThis & {opener?: Window | null}).opener ?? null;
  if (!opener) {
    return Promise.reject(new Error('The original tab connection is unavailable (try keeping both tabs in the same browser window, or use Manual file transfer below).'));
  }
  return new Promise<ReceivedHandoffPayload>((resolve, reject) => {
    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(pingTimer);
      clearTimeout(timeoutTimer);
      globalThis.removeEventListener('message', onMessage);
      cb();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== params.sourceOrigin || event.source !== opener) return;
      const data = event.data as {type?: unknown; nonce?: unknown; buffer?: unknown; password?: unknown} | null;
      if (!data || typeof data !== 'object' || data.type !== 'getbased-migration-payload' || data.nonce !== params.nonce) return;
      if (!(data.buffer instanceof ArrayBuffer) || typeof data.password !== 'string' || data.password.length < 12) {
        finish(() => reject(new Error('The incoming transfer payload was invalid.')));
        return;
      }
      try {
        opener.postMessage({type: 'getbased-migration-ack', nonce: params.nonce}, params.sourceOrigin);
      } catch { /* ignore */ }
      const blob = new Blob([data.buffer], {type: 'application/json'});
      const password = data.password;
      finish(() => resolve({blob, password, sourceOrigin: params.sourceOrigin}));
    };
    globalThis.addEventListener('message', onMessage);
    const ping = () => {
      try {
        opener.postMessage({type: 'getbased-migration-ready', nonce: params.nonce}, params.sourceOrigin);
      } catch { /* ignore */ }
    };
    ping();
    const pingTimer = setInterval(ping, 400);
    const timeoutTimer = setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for data from the original tab. Return to the original tab and click Move my data automatically again.')));
    }, timeoutMs);
  });
}
