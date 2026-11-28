import {isPublicDemoOrigin} from '../shared/hosted-transition.js';
import {showNotification} from './utils.js';

let seedingDepth = 0;
let lastBlockedNoticeAt = 0;

export function isPublicDemoMode(loc: Pick<Location, 'origin'> | undefined = typeof location !== 'undefined' ? location : undefined): boolean {
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.publicDemo === 'true') return true;
  if (!loc) return false;
  return isPublicDemoOrigin(loc.origin);
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
  showNotification(`${prefix} Explore Demo Sarah and Demo Alex here, or deploy your own private copy of getbased to track your own data.`, 'info', 6000);
}
