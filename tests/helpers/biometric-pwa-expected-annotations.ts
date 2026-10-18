import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {BiometricOverviewReceipt} from './biometric-overview-pwa-receipt.js';

export interface BiometricNativeNode {
  type: number; name?: string; namespace?: string | null;
  attributes?: string[][]; children?: BiometricNativeNode[]; text?: string | null;
}
const oracleFile = 'tests/fixtures/biometric-overview-pwa-native.json';
export const biometricPwaGrammarSources = {
  'js/components/DashboardWidgetFrame.svelte': 'd0aaee390cfca25a55af11aaa1d57e68930490a79c735df7619fae563b0ce47d',
  'js/components/DashboardWidgetBody.svelte': '0e411cf03bbb3bb97ee44acf6b0e3833bdd5e35ba93a24c45c11e00bfa0c9595',
  'js/components/LensDataWidgetBody.svelte': 'e6efa8589379046e1dbe278ecc40b3b5f4f11f285a6c6bb3cb68450f727374fb',
  'js/components/DashboardBiometricsOverview.svelte': '7c2a9b39c0ea870f77202fe8fbb1886bdb42bdf7331c3b38a96b653fe86676ce',
  'js/components/DashboardBiometricSyncStatus.svelte': '24735f0a2c874298e5bb5517e303b862c0c9c530b893b1211f76f1b916cb9bf1',
  'js/components/DashboardBiometricTile.svelte': 'e76a03b8133e7e285b89b9f5a3b9791ba999463c44cf34887fc5c30536537cf1',
} as const;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Qualify finite compiler coordinates and the untouched independent native oracle. */
export function qualifyBiometricPwaGrammar(read = (file: string): string => readFileSync(file, 'utf8')): void {
  assert.equal(sha(read(oracleFile)), '66386541cbf5b7d809db9a4f58b56394a3a5fd39dcb868fb0df261af4f9f6cb4', 'Immutable native Biometrics oracle');
  for (const [file, digest] of Object.entries(biometricPwaGrammarSources)) assert.equal(sha(read(file)), digest, 'Reviewed complete Biometrics owner: ' + file);
  const lock = JSON.parse(read('package-lock.json')) as {packages: Record<string, {version?: string}>};
  assert.equal(lock.packages['node_modules/svelte']?.version, '5.57.1', 'Reviewed Svelte conditional/each compiler version');
}
const comment = (text: string): BiometricNativeNode => ({type: 8, text});
const whitespace = (text: string): BiometricNativeNode => ({type: 3, text});
const attribute = (node: BiometricNativeNode, name: string) => node.attributes?.find(row => row[0] === name)?.[1] ?? null;
const hasClass = (node: BiometricNativeNode, value: string) => (attribute(node, 'class') ?? '').split(' ').includes(value);
function children(node: BiometricNativeNode): BiometricNativeNode[] {assert(Array.isArray(node.children)); return node.children;}
function find(root: BiometricNativeNode, predicate: (node: BiometricNativeNode) => boolean): BiometricNativeNode[] {
  return [...(predicate(root) ? [root] : []), ...(root.children ?? []).flatMap(node => find(node, predicate))];
}
function one(root: BiometricNativeNode, predicate: (node: BiometricNativeNode) => boolean): BiometricNativeNode {
  const matches = find(root, predicate); assert.equal(matches.length, 1, 'Exactly one native Biometrics receiver'); return matches[0]!;
}
function nativeNode(node: BiometricNativeNode): void {
  if (node.type === 3) {assert.equal(typeof node.text, 'string'); return;}
  assert.equal(node.type, 1, 'Native oracle contains no compiler coordinates');
  assert.equal(node.namespace, 'http://www.w3.org/1999/xhtml'); assert.equal(typeof node.name, 'string');
  assert(Array.isArray(node.attributes)); for (const row of node.attributes) {assert.equal(row.length, 2); assert(row.every(value => typeof value === 'string'));}
  children(node).forEach(nativeNode);
}
const text = (node: BiometricNativeNode): string => node.type === 3 ? node.text ?? '' : children(node).map(text).join('');

/** Expected-only addition of the six reviewed owners' exact SDK boundaries.
 * Every native element, ordered attribute, literal character and action survives.
 * Actual browser receipts never pass through this function. Every workflow change
 * reconstructs the Dashboard, so these are fresh SSR/hydration coordinates. */
export function expectedBiometricPwaReceipt(input: BiometricOverviewReceipt): BiometricOverviewReceipt {
  const result = structuredClone(input), nodes = result.children as BiometricNativeNode[];
  nodes.forEach(nativeNode); assert.equal(nodes.length, 2, 'Native toolbar and body only');
  const bar = nodes[0]!, body = nodes[1]!; assert.equal(attribute(bar, 'class'), 'db-biometric-overview-bar');
  const actions = one(bar, node => hasClass(node, 'db-biometric-overview-actions')), old = children(actions);
  const picker = one(actions, node => attribute(node, 'data-dashboard-widget-action') === 'open-biometric-picker');
  const statuses = find(actions, node => hasClass(node, 'db-biometric-sync-status')); assert(statuses.length <= 1);
  const sync = statuses[0];
  if (!sync) {
    assert.deepEqual(old, [whitespace('\n        \n        '), picker, whitespace('\n      ')]);
    actions.children = [whitespace('\n        '), comment('[-1'), comment(']'), comment(''), whitespace('\n        '), picker, whitespace('\n      ')];
  } else {
    const stale = hasClass(sync, 'is-stale'), buttons = find(actions, node => attribute(node, 'data-dashboard-widget-action') === 'sync-biometric-now');
    assert.equal(buttons.length, stale ? 1 : 0); const button = buttons[0];
    assert.deepEqual(old, stale
      ? [whitespace('\n        '), sync, whitespace('\n      '), button, whitespace('\n        '), picker, whitespace('\n      ')]
      : [whitespace('\n        '), sync, whitespace('\n      \n        '), picker, whitespace('\n      ')]);
    actions.children = [whitespace('\n        '), comment('[0'), sync, whitespace('\n      '), comment(stale ? '[0' : '[-1'), ...(button ? [button] : []), comment(']'), comment(']'), comment(''), whitespace('\n        '), picker, whitespace('\n      ')];
  }
  const counter = one(bar, node => node.name === 'span' && !hasClass(node, 'db-biometric-sync-status'));
  assert.equal(text(counter), result.count); const count = /^(\d+) metric(s?) selected$/.exec(result.count ?? ''); assert(count);
  const grid = hasClass(body, 'db-biometric-overview-grid');
  if (grid) {
    assert.equal(attribute(body, 'class'), 'db-wearable-grid db-biometric-overview-grid');
    const rows = children(body); assert(rows.length > 0); assert.equal(rows.length, Number(count[1]));
    body.children = [comment('['), ...rows.flatMap(row => {
      assert.equal(row.name, 'div'); assert.deepEqual(row.attributes, [['class', 'db-biometric-tile-wrap']]);
      const manual = find(row, node => hasClass(node, 'db-biometric-manual-empty'));
      const populated = find(row, node => hasClass(node, 'db-biometric-widget'));
      assert.equal(manual.length + populated.length, 1, 'Exactly one native tile branch');
      return [comment(manual.length ? '[0' : '[-1'), row, comment(']')];
    }), comment(']')];
  } else {
    assert.equal(attribute(body, 'class'), 'dashboard-widget-empty'); assert.equal(Number(count[1]), 0);
    assert.deepEqual(body.children, [whitespace('No biometrics selected.')]);
  }
  // DashboardWidgetBody's default arm, LensDataWidgetBody's unchanged wearables arm [4],
  // Overview's rows branch and Frame's component boundary are individually exact.
  result.children = [comment('[-1'), comment('[4'), bar, comment(grid ? '[0' : '[-1'), body, comment(']'), comment(']'), comment(']'), comment('')];
  return result;
}
