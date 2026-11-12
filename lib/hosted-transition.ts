import {getHostedTransition} from '../shared/hosted-transition.js';
import type {ProxyCaller} from './proxy-policy.js';

/** Bind the neutral rollout dates to the operated HTTP request boundary. */
export function isHostedRecoveryRequest(req: ProxyCaller, operatedHost: boolean): boolean {
  return getHostedTransition(new URL(req.url).origin)?.phase === 'recovery'
    || operatedHost && getHostedTransition(req.headers.get('origin') || '')?.phase === 'recovery';
}
