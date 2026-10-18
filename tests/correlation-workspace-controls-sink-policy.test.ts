import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import {correlationWorkspaceChromeOwners,correlationWorkspaceControlsOwners,historicalCorrelationChromeOwnerCount,historicalCorrelationControlsOwnerCount} from './helpers/dashboard-current-zero-sink-owners.js';
import {wearablePresentationOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {dashboardInsightsLoadingOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {emfComparisonOwners,historicalEMFComparisonOwnerCount} from './helpers/dashboard-current-zero-sink-owners.js';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { scanDomSinks } from '../scripts/dom-sink-audit.mjs';
import rawCandidate from '../scripts/dom-sink-policy.json' with { type: 'json' };
import before from './fixtures/correlation-workspace-controls-sink-policy-before.json' with { type: 'json' };
import chromeBefore from './fixtures/correlation-workspace-chrome-sink-policy-before.json' with { type: 'json' };
const controlsOwners = correlationWorkspaceControlsOwners;
const chromeOwners = correlationWorkspaceChromeOwners;
import {categoryOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {sidebarOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {dashboardBiometricOwners as biometricOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {categoryPageOwners} from './helpers/dashboard-current-zero-sink-owners.js';
const root = path.resolve('.');
function fingerprint(source: string, file: string) {
  const sinks = scanDomSinks(source, file);
  const surface = sinks.map(({kind, source}) => ({kind, source})).sort((a,b) => `${a.kind}:${a.source}`.localeCompare(`${b.kind}:${b.source}`));
  return { count: sinks.length, digest: createHash('sha256').update(JSON.stringify(surface)).digest('hex'), kinds: Object.fromEntries([...new Set(sinks.map(s => s.kind))].sort().map(kind => [kind, sinks.filter(s => s.kind === kind).length])) };
}
it('preserves the exact historical controls/chrome transition and qualifies the complete current controller',()=>{
 qualifyHistoricalSinkEvidence();expect(controlsOwners).toHaveLength(2);expect(chromeOwners).toHaveLength(4);expect(historicalCorrelationControlsOwnerCount).toBe(3);expect(historicalCorrelationChromeOwnerCount).toBe(3);expect(categoryOwners).toHaveLength(13);
 const changed='js/therapy-correlation-view.js';expect(chromeBefore.scannedFiles).toBe(before.scannedFiles+historicalCorrelationControlsOwnerCount);
 expect(chromeBefore.schemaVersion).toBe(before.schemaVersion);expect(chromeBefore.scope).toBe(before.scope);expect(chromeBefore.reviewRule).toBe(before.reviewRule);expect(chromeBefore.sinkCount).toBe(before.sinkCount);
 expect(Object.keys(chromeBefore.files)).toEqual(Object.keys(before.files));for(const[key,value]of Object.entries(before.files))if(key!==changed)expect(chromeBefore.files[key as keyof typeof chromeBefore.files]).toEqual(value);expect(chromeBefore.files[changed].count).toBe(before.files[changed].count);expect(chromeBefore.files[changed].kinds).toEqual(before.files[changed].kinds);
 qualifyCurrentDomSinkPolicy(rawCandidate);const file='js/therapy-correlation-view.ts';expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file)).toEqual(rawCandidate.files[changed]);
});

it.each([...controlsOwners, ...chromeOwners])('adds no raw HTML sink in %s', file => {
  expect(fingerprint(readFileSync(path.join(root, file), 'utf8'), file).count).toBe(0);
});
it.each(['js/components/CorrelationWorkspaceControls.svelte','js/components/CorrelationWorkspaceChrome.svelte']as const)('detects unreviewed raw HTML in the new owner %s', file => {
  const source = readFileSync(path.join(root, file), 'utf8');
  const changed = source.replace('</script>', "</script>{@html 'foreign-raw-child'}");
  expect(changed).not.toBe(source); expect(fingerprint(changed, file).count).toBeGreaterThan(0);
});

it.each(categoryOwners)('Category adds no raw HTML sink in %s', file => {
  expect(fingerprint(readFileSync(path.join(root, file), 'utf8'), file).count).toBe(0);
});

it.each(sidebarOwners)('Sidebar adds no raw HTML sink in %s', file => {
  expect(fingerprint(readFileSync(path.join(root, file), 'utf8'), file).count).toBe(0);
});

it('accounts for exactly five named Biometrics sources',()=>{expect(biometricOwners).toHaveLength(5);});
it.each(biometricOwners)('Biometrics adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});

it('accounts for exactly six genuine Category page sources',()=>{expect(categoryPageOwners).toHaveLength(6);});
it.each(categoryPageOwners)('Category page adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});

it('accounts for exactly two current EMF Comparison sources and three qualified historical retirements',()=>{expect(emfComparisonOwners).toHaveLength(2);expect(historicalEMFComparisonOwnerCount).toBe(5);});
it.each(emfComparisonOwners)('EMF Comparison adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});

it('accounts for exactly six named Dashboard loading and Insights sources',()=>{expect(dashboardInsightsLoadingOwners).toHaveLength(6);});
it.each(dashboardInsightsLoadingOwners)('Dashboard loading and Insights adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});

it('accounts for exactly15current Wearable strip and detail sources',()=>{expect(wearablePresentationOwners).toHaveLength(15);});
it.each(wearablePresentationOwners)('Wearable presentation adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
