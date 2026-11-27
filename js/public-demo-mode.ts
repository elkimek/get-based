import {isPublicDemoOrigin} from '../shared/hosted-transition.js';
import {showNotification} from './utils.js';

let seedingDepth = 0;
let lastBlockedNoticeAt = 0;

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function isPublicDemoMode(loc: Pick<Location, 'origin' | 'hostname' | 'search'> | undefined = typeof location !== 'undefined' ? location : undefined): boolean {
  if (!loc) return false;
  if (isPublicDemoOrigin(loc.origin)) return true;
  if (isLoopbackHost(String(loc.hostname || '').toLowerCase())) {
    try {
      const params = new URLSearchParams(loc.search || '');
      if (params.get('public-demo') === '1') return true;
    } catch { /* ignore malformed query */ }
  }
  return false;
}

export function isPublicDemoSeeding(): boolean {
  return seedingDepth > 0;
}

export async function withPublicDemoSeeding<T>(fn: () => Promise<T>): Promise<T> {
  seedingDepth += 1;
  try {
    return await fn();
  } finally {
    seedingDepth = Math.max(0, seedingDepth - 1);
  }
}

export function notifyPublicDemoBlocked(feature?: string): void {
  const now = Date.now();
  if (now - lastBlockedNoticeAt < 1500) return;
  lastBlockedNoticeAt = now;
  const prefix = feature ? `${feature} is disabled in the public demo.` : 'Demo mode is read-only.';
  showNotification(`${prefix} Explore Demo Sarah and Demo Alex here, or self-host getbased to track your own data.`, 'info', 6000);
}
