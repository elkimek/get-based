// Public rollout state: app.getbased.health runs in locked interactive demo mode for
// new visitors and guides existing hosted users through the 30-day self-hosting transition.
export interface HostedTransitionPolicy {announcedAt: string | null; announcementUrl: string | null; demoUrl: string | null}
export const HOSTED_TRANSITION_POLICY: Readonly<HostedTransitionPolicy> = Object.freeze({
  announcedAt: '2026-11-27T10:00:00Z',
  announcementUrl: 'https://getbased.health/self-hosting',
  demoUrl: 'https://app.getbased.health',
});
export const HOSTED_NOTICE_DAYS = 30;
const HOSTED_ORIGINS = new Set(['https://app.getbased.health', 'https://getbased.health', 'https://www.getbased.health', 'https://get-based.vercel.app',
  'http://iobqafpywmncin7m2wpvbemouvulaeb7jnvtvugxnru4gpneushb5jyd.onion']);
const PUBLIC_DEMO_ORIGINS = new Set(['https://getbased-demo.vercel.app', 'https://demo.getbased.health']);
export function isPublicDemoOrigin(origin: string): boolean {
  let canonical: string;
  try {const url = new URL(origin); url.hostname = url.hostname.replace(/\.$/, ''); canonical = url.origin;} catch {return false;}
  return PUBLIC_DEMO_ORIGINS.has(canonical);
}
export interface HostedTransition {phase: 'notice' | 'recovery'; announcedAt: number; cutoffAt: number; announcementUrl: string | null; demoUrl: string | null}
export function getHostedTransition(origin: string, now = Date.now(), policy: Readonly<HostedTransitionPolicy> = HOSTED_TRANSITION_POLICY): HostedTransition | null {
  let canonical: string;
  try {const url = new URL(origin); url.hostname = url.hostname.replace(/\.$/, ''); canonical = url.origin;} catch {return null;}
  if (!HOSTED_ORIGINS.has(canonical) || policy.announcedAt === null) return null;
  const announcedAt = Date.parse(policy.announcedAt);
  if (!Number.isFinite(announcedAt) || !/Z$/.test(policy.announcedAt)) throw new Error('The hosted announcement timestamp must be a valid UTC date.');
  if (now < announcedAt) return null;
  const cutoffAt = announcedAt + HOSTED_NOTICE_DAYS * 24 * 60 * 60 * 1000;
  return {phase: now < cutoffAt ? 'notice' : 'recovery', announcedAt, cutoffAt,
    announcementUrl: policy.announcementUrl, demoUrl: policy.demoUrl};
}
