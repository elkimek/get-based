import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import {wearablePresentationOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {dashboardInsightsLoadingOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {emfComparisonOwners,historicalEMFComparisonOwnerCount} from './helpers/dashboard-current-zero-sink-owners.js';

import {readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {expect,it} from 'vitest';import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';import rawCandidate from '../scripts/dom-sink-policy.json' with {type:'json'};import original from './fixtures/sidebar-sink-policy-before.json' with {type:'json'};
import {dashboardBiometricOwners as biometricOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {categoryPageOwners} from './helpers/dashboard-current-zero-sink-owners.js';
const root=path.resolve('.');import {sidebarOwners as owners,historicalSidebarOwnerCount} from './helpers/dashboard-current-zero-sink-owners.js';
function fingerprint(source:string,file:string){const rows=scanDomSinks(source,file),surface=rows.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));return{count:rows.length,digest:createHash('sha256').update(JSON.stringify(surface)).digest('hex'),kinds:Object.fromEntries([...new Set(rows.map(x=>x.kind))].sort().map(k=>[k,rows.filter(x=>x.kind===k).length]))};}
it('qualifies five genuine owners, immutable nine-owner history and the exact current navigation sink contract',()=>{qualifyHistoricalSinkEvidence();expect(owners).toHaveLength(5);expect(historicalSidebarOwnerCount).toBe(9);expect(original.scannedFiles).toBe(1619);qualifyCurrentDomSinkPolicy(rawCandidate);const file='js/nav.ts';expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file)).toEqual(rawCandidate.files['js/nav.js']);});

it.each(owners)('adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
it('detects an unreviewed raw HTML Svelte child without weakening existing sink rules',()=>{const file='js/components/SidebarNavigation.svelte';const source=readFileSync(path.join(root,file),'utf8'),changed=source.replace('</script>',"</script>{@html 'foreign-sidebar-child'}");expect(changed).not.toBe(source);expect(fingerprint(changed,file).count).toBeGreaterThan(0);});

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
