import {expect, it} from 'vitest';
import {getHostedTransition, HOSTED_TRANSITION_POLICY, HOSTED_NOTICE_DAYS} from '../shared/hosted-transition.js';
const policy = {announcedAt: '2026-11-12T15:00:00.000Z', announcementUrl: 'https://getbased.health/updates', demoUrl: 'https://demo.getbased.health'};
it('configures the official hosted rollout policy and stays inactive before announcedAt', () => {
  expect(HOSTED_TRANSITION_POLICY.announcedAt).toBe('2026-11-27T10:00:00Z');
  expect(HOSTED_TRANSITION_POLICY.announcementUrl).toBe('https://getbased.health/self-hosting');
  expect(HOSTED_TRANSITION_POLICY.demoUrl).toBe('https://app.getbased.health');
  expect(getHostedTransition('https://app.getbased.health', Date.parse(policy.announcedAt), {announcedAt: null, announcementUrl: null, demoUrl: null})).toBeNull();
  expect(getHostedTransition('https://app.getbased.health', Date.parse(policy.announcedAt) - 1, policy)).toBeNull();
});
it('gives exactly 30 days and retains recovery at the boundary and afterward', () => {
  const start = Date.parse(policy.announcedAt), cutoff = start + 30*24*60*60*1000;
  expect(HOSTED_NOTICE_DAYS).toBe(30);
  expect(getHostedTransition('https://app.getbased.health', start, policy)).toMatchObject({phase: 'notice', cutoffAt: cutoff});
  expect(getHostedTransition('https://app.getbased.health', cutoff-1, policy)?.phase).toBe('notice');
  for (const now of [cutoff, cutoff+365*24*60*60*1000]) expect(getHostedTransition('https://app.getbased.health', now, policy)?.phase).toBe('recovery');
});
it('does not apply the official hosted cutoff to independent self-hosted origins', () => {
  for (const origin of ['http://127.0.0.1:8000','http://localhost:8000','https://your-host.example','https://host.tailnet.ts.net','https://app.getbased.health.example','https://demo.getbased.health', 'http://independent.onion']) {
    expect(getHostedTransition(origin, Date.parse(policy.announcedAt)+365*24*60*60*1000, policy)).toBeNull();
  }
});

it('covers canonical public aliases without allowing a spelling or port bypass', () => {
  const now = Date.parse(policy.announcedAt) + 31*24*60*60*1000;
  for (const origin of ['https://get-based.vercel.app', 'https://APP.GETBASED.HEALTH:443', 'https://app.getbased.health.', 'http://iobqafpywmncin7m2wpvbemouvulaeb7jnvtvugxnru4gpneushb5jyd.onion']) expect(getHostedTransition(origin, now, policy)?.phase).toBe('recovery');
  for (const origin of ['', 'null', 'https://app.getbased.health.example', 'https://app.getbased.health:8443']) expect(getHostedTransition(origin, now, policy)).toBeNull();
});
