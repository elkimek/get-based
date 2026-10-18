// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { renderFirstLaunchLegal, renderFirstLaunchLegalBoot } from '../js/legal-first-launch-presentation.js';
import { projectFirstLaunchLegal, TERMS_VERSION, PRIVACY_VERSION } from '../js/legal-first-launch-view.js';
import { withLegalConsentSnapshot } from '../scripts/legal-consent-snapshot.mjs';
import { maybeShowLegalConsentGate, hasAcceptedCurrentLegal, getLegalAcceptance } from '../js/legal-consent.js';
import type { DeploymentOperator } from '../js/deployment-policy.js';
vi.mock('../js/utils.js', () => ({showNotification: vi.fn()}));
vi.mock('../js/utils-runtime.js', () => ({dispatchUtilsRuntimeEvent: vi.fn(), getAppVersionRuntime: () => 'legal-test'}));
import { showNotification } from '../js/utils.js';
import { dispatchUtilsRuntimeEvent } from '../js/utils-runtime.js';
type Receipt = {policy: DeploymentOperator; update: boolean; html: string};
const fixture = fs.readFileSync('tests/fixtures/legal-first-launch-native.json', 'utf8');
const receipts = JSON.parse(fixture) as Receipt[];
function dom(html: string): unknown {
 const host = document.createElement('div'); host.innerHTML = html;
 const root = host.firstElementChild!;
 const walk = (node: Node): unknown => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  const element = node as Element;
  const children: unknown[] = [];
  for (const child of element.childNodes) {
   if (child.nodeType === Node.COMMENT_NODE) continue;
   const value = walk(child);
   if (typeof value === 'string' && typeof children.at(-1) === 'string') children[children.length - 1] = String(children.at(-1)) + value;
   else children.push(value);
  }
  return {tag: element.localName, attributes: [...element.attributes].map(a => [a.name,a.value]),children};
 };
 return walk(root);
}
beforeEach(() => {
 vi.useFakeTimers(); vi.clearAllMocks(); document.body.innerHTML = ''; document.body.className = '';
 localStorage.clear(); delete document.documentElement.dataset.legalConsentBootstrapResult;
 vi.stubGlobal('GETBASED_DEPLOYMENT_CONFIG', {operator: {}});
});
afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
it('pins all original native receipts without altering their bytes', () => {
 expect(crypto.createHash('sha256').update(fixture).digest('hex')).toBe('a016fe9a0b64d3d3065773d6e5e028868f44faa9e50ccfe5372d70d8c1be3534');
 expect(receipts).toHaveLength(16);
});
it.each(receipts)('preserves the complete native DOM for policy $policy and update $update', ({policy,update,html}) => {
 const actual = renderFirstLaunchLegal(policy,update);
 expect(dom(actual)).toEqual(dom(html));
 const host = document.createElement('div');host.innerHTML=actual;
 const input = host.querySelector<HTMLInputElement>('#legal-consent-checkbox')!;
 const button = host.querySelector<HTMLButtonElement>('[data-legal-consent-action="accept"]')!;
 expect(input.checked).toBe(false);expect(input.defaultChecked).toBe(false);expect(button.disabled).toBe(true);
 expect(host.querySelectorAll('a')).toHaveLength(Number(!!policy.termsUrl)+Number(!!policy.privacyUrl));
});
it('preserves the original early overlay complete native DOM and legal versions', () => {
 const original = fs.readFileSync('tests/fixtures/legal-first-launch-boot.html','utf8');
 expect(dom(renderFirstLaunchLegalBoot())).toEqual(dom(original));
 expect([TERMS_VERSION,PRIVACY_VERSION]).toEqual(['2026-08-22','2026-08-22']);
});
it('treats hostile deployment metadata as text and single attributes', () => {
 const policy = {name: '<img src=x onerror=attack()> & "operator"',termsUrl: 'https://operator.test/terms?x=" onclick="attack()',privacyUrl: ''};
 const host = document.createElement('div');host.innerHTML=renderFirstLaunchLegal(policy);
 expect(host.querySelector('img')).toBeNull();expect(host.querySelector('[onclick]')).toBeNull();
 expect(host.querySelector('.legal-consent-kicker')!.textContent).toBe(policy.name+' legal');
 expect(host.querySelector('a')!.getAttribute('href')).toBe(policy.termsUrl);
 expect(host.querySelector('.legal-consent-check span')!.textContent).toBe(`I have read and agree to ${policy.name}'s Terms of Service.`);
 expect(host.querySelector('a')!.rel).toBe('noopener');expect(host.querySelector('a')!.target).toBe('_blank');
});
it('generates idempotent early snapshots before classic bootstrap and preserves every outside byte', () => {
 const original = fs.readFileSync('tests/fixtures/legal-first-launch-boot.html','utf8');
 const suffix = '<!-- PRODUCTION_LEGAL_BOOTSTRAP_START --><script src="js/legal-consent-bootstrap.js"></script><!-- PRODUCTION_LEGAL_BOOTSTRAP_END --><main>Keep</main></body></html>';
 const prefix = '<!doctype html><html><head>Keep head</head><body>';
 const output = withLegalConsentSnapshot(prefix+'\n'+original+'\n'+suffix,renderFirstLaunchLegalBoot());
 expect(output.startsWith(prefix)).toBe(true);expect(output.endsWith(suffix)).toBe(true);
 expect(output.indexOf('LEGAL_SVELTE_BOOT_END')).toBeLessThan(output.indexOf('PRODUCTION_LEGAL_BOOTSTRAP_START'));
 expect(withLegalConsentSnapshot(output,renderFirstLaunchLegalBoot())).toBe(output);
});
it.each(['missing-bootstrap','duplicate-bootstrap','missing-body','wrong-initial-child','missing-end','duplicate-start','inverted-markers','late-markers'])('rejects corrupt legal snapshot boundary %s', kind => {
 const start='<!-- LEGAL_SVELTE_BOOT_START -->',end='<!-- LEGAL_SVELTE_BOOT_END -->',bootstrap='<!-- PRODUCTION_LEGAL_BOOTSTRAP_START -->';
 const cases: Record<string,string> = {
  'missing-bootstrap':'<body>'+start+end,
  'duplicate-bootstrap':'<body>'+start+end+bootstrap+bootstrap,
  'missing-body':bootstrap,
  'wrong-initial-child':'<body><main>Keep</main>'+bootstrap,
  'missing-end':'<body>'+start+bootstrap,
  'duplicate-start':'<body>'+start+start+end+bootstrap,
  'inverted-markers':'<body>'+end+start+bootstrap,
  'late-markers':'<body>'+bootstrap+start+end,
 };
 expect(()=>withLegalConsentSnapshot(cases[kind]!,renderFirstLaunchLegalBoot())).toThrow();
});
it('creates the current gate, focuses its checkbox, preserves live node identity, and accepts exactly once', async () => {
 expect(maybeShowLegalConsentGate()).toBe(true);const overlay=document.getElementById('legal-consent-overlay')!;
 expect(dom(overlay.innerHTML)).toEqual(dom(renderFirstLaunchLegal({name:'',termsUrl:'',privacyUrl:''})));
 const checkbox=overlay.querySelector<HTMLInputElement>('#legal-consent-checkbox')!;
 const button=overlay.querySelector<HTMLButtonElement>('[data-legal-consent-action="accept"]')!;
 await vi.advanceTimersByTimeAsync(35);expect(document.activeElement).toBe(checkbox);
 button.click();expect(hasAcceptedCurrentLegal()).toBe(false);expect(document.getElementById('legal-consent-overlay')).toBe(overlay);
 checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));expect(button.disabled).toBe(false);
 expect(maybeShowLegalConsentGate()).toBe(true);expect(document.getElementById('legal-consent-checkbox')).toBe(checkbox);expect(checkbox.checked).toBe(true);
 button.click();expect(document.getElementById('legal-consent-overlay')).toBeNull();expect(hasAcceptedCurrentLegal()).toBe(true);
 expect(getLegalAcceptance()).toMatchObject({accepted:true,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION,policyScope:'self-hosted-notice',appVersion:'legal-test'});
 expect(dispatchUtilsRuntimeEvent).toHaveBeenCalledExactlyOnceWith('legal-consent-accepted');
 expect(showNotification).toHaveBeenCalledWith('Terms and Privacy accepted.','success',3000);
 expect(maybeShowLegalConsentGate()).toBe(false);
});
it('replaces stale consent for an actual changed operator without accepting it', () => {
 localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION,policyScope:'old'}));
 document.body.innerHTML=renderFirstLaunchLegalBoot();const old=document.getElementById('legal-consent-overlay');
 vi.stubGlobal('GETBASED_DEPLOYMENT_CONFIG',{operator:{name:'Independent operator',termsUrl:'https://operator.test/terms',privacyUrl:''}});
 expect(maybeShowLegalConsentGate()).toBe(true);expect(document.getElementById('legal-consent-overlay')).not.toBe(old);
 expect(document.getElementById('legal-consent-title')!.textContent).toBe('Review updated Terms & Privacy');
 expect(document.querySelectorAll('.legal-consent-check a')).toHaveLength(1);expect(hasAcceptedCurrentLegal()).toBe(false);
 expect(document.getElementById('legal-consent-overlay')!.dataset.policyScope).toBe('Independent operator|https://operator.test/terms|');
});
it('has genuinely typed owned children with no raw-markup parser or renderer templates', () => {
 const body=fs.readFileSync('js/components/LegalFirstLaunchBody.svelte','utf8');
 const boot=fs.readFileSync('js/components/LegalFirstLaunchBoot.svelte','utf8');
 const controller=fs.readFileSync('js/legal-consent.ts','utf8');
 expect(body).not.toContain('@html');expect(boot).not.toContain('@html');
 expect(boot).toContain('<LegalFirstLaunchBody {view} />');expect(body).toContain('{#each view.links as link, index}');
 expect(controller).toContain('return renderFirstLaunchLegal(currentPolicy(), update)');
 expect(controller).not.toContain('policyAcceptanceMarkup');expect(controller).not.toContain('<div class="legal-consent-modal"');
 expect(projectFirstLaunchLegal({name:'',termsUrl:'',privacyUrl:''}).links).toEqual([]);
});
