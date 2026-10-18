import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import {wearablePresentationOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {dashboardInsightsLoadingOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
import rawCandidate from '../scripts/dom-sink-policy.json' with {type:'json'};
import before from './fixtures/emf-comparison-sink-policy-before.json' with {type:'json'};
import {emfComparisonOwners as owners,historicalEMFComparisonOwnerCount} from './helpers/dashboard-current-zero-sink-owners.js';
const root=path.resolve('.');
function fingerprint(source:string,file:string){const rows=scanDomSinks(source,file),surface=rows.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));return{count:rows.length,digest:createHash('sha256').update(JSON.stringify(surface)).digest('hex'),kinds:Object.fromEntries([...new Set(rows.map(row=>row.kind))].sort().map(kind=>[kind,rows.filter(row=>row.kind===kind).length]))};}
it('qualifies two genuine owners and preserves the immutable five-owner history plus exact current editor sinks',()=>{qualifyHistoricalSinkEvidence();expect(owners).toHaveLength(2);expect(historicalEMFComparisonOwnerCount).toBe(5);expect(before.scannedFiles).toBe(1639);qualifyCurrentDomSinkPolicy(rawCandidate);const file='js/emf-editor.ts';expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file)).toEqual(rawCandidate.files['js/emf-editor.js']);expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(2);});

it.each(owners)('adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
it('detects an unreviewed Svelte raw comparison child',()=>{const file='js/components/EMFComparison.svelte',source=readFileSync(path.join(root,file),'utf8'),changed=source.replace('</script>',"</script>{@html 'foreign-emf-comparison'}");expect(changed).not.toBe(source);expect(fingerprint(changed,file).count).toBeGreaterThan(0);});
it('detects a foreign native editor assignment without relaxing the two native commit sinks',()=>{const file='js/emf-editor.ts',source=readFileSync(path.join(root,file),'utf8'),changed=source+'\ndocument.body.innerHTML = "unqualified-emf-comparison";\n';expect(fingerprint(changed,file).count).toBe(3);expect(fingerprint(changed,file)).not.toEqual(fingerprint(source,file));});

it('accounts for exactly six named Dashboard loading and Insights sources',()=>{expect(dashboardInsightsLoadingOwners).toHaveLength(6);});
it.each(dashboardInsightsLoadingOwners)('Dashboard loading and Insights adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});

it('accounts for exactly15current Wearable strip and detail sources',()=>{expect(wearablePresentationOwners).toHaveLength(15);});
it.each(wearablePresentationOwners)('Wearable presentation adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
