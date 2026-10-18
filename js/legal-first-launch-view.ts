import type { DeploymentOperator } from './deployment-policy.js';

export const TERMS_VERSION = '2026-08-22';
export const PRIVACY_VERSION = '2026-08-22';
export interface FirstLaunchLegalView {
 readonly kicker: string;
 readonly title: string;
 readonly description: string;
 readonly termsVersion: string;
 readonly privacyVersion: string;
 readonly statementPrefix: string;
 readonly links: readonly { readonly url: string; readonly label: string; readonly kind: 'terms' | 'privacy' }[];
 readonly statementSuffix: string;
 readonly acceptLabel: string;
}

/** Deployment metadata becomes text and attributes, never executable markup. */
export function projectFirstLaunchLegal(policy: DeploymentOperator, update = false): FirstLaunchLegalView {
 const hasPolicies = !!(policy.termsUrl || policy.privacyUrl);
 const links: FirstLaunchLegalView['links'][number][] = [];
 if (policy.termsUrl) links.push({url: policy.termsUrl, label: 'Terms of Service', kind: 'terms'});
 if (policy.privacyUrl) links.push({url: policy.privacyUrl, label: 'Privacy Policy', kind: 'privacy'});
 return {
  kicker: hasPolicies ? `${policy.name || 'Deployment'} legal` : 'Self-hosted getbased',
  title: update ? (hasPolicies ? 'Review updated Terms & Privacy' : 'Review updated app notice')
   : (hasPolicies ? 'Accept Terms & Privacy' : 'Review self-hosted app notice'),
  description: update
   ? (hasPolicies ? 'The deployment policy identity or links changed since this browser last accepted them. Please review the current documents before continuing.'
    : 'The self-hosted app notice changed since this browser last acknowledged it. Please review it before continuing.')
   : (hasPolicies ? `Before using getbased, please review ${policy.name ? `${policy.name}'s` : "the deployment operator's"} policies.`
    : 'This independent self-hosted deployment has not configured operator Terms or Privacy links.'),
  termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
  statementPrefix: hasPolicies ? `I have read and agree to ${policy.name ? `${policy.name}'s ` : "the deployment operator's "}`
   : 'I acknowledge that this self-hosted getbased deployment is operated independently and that optional network features send data to the destinations disclosed at activation.',
  links, statementSuffix: hasPolicies ? '.' : '',
  acceptLabel: hasPolicies ? 'Accept & continue' : 'Acknowledge & continue',
 };
}

/** Host-independent early snapshot; the classic bootstrap applies the actual operator. */
export function projectFirstLaunchLegalBoot(): FirstLaunchLegalView {
 return {
  ...projectFirstLaunchLegal({name: '', termsUrl: '/terms', privacyUrl: '/privacy'}),
  kicker: 'getbased legal',
  description: 'Before using getbased, please review and accept the Terms and Privacy Policy.',
  statementPrefix: 'I have read and agree to the ',
 };
}
