import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import {wearablePresentationOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
import candidate from '../scripts/dom-sink-policy.json' with {type:'json'};
import before from './fixtures/dashboard-insights-loading-sink-policy-before.json' with {type:'json'};
import historicalInverse from './fixtures/dashboard-insights-loading-controller-inverse.json' with {type:'json'};
import inverse from './fixtures/dashboard-loading-insights-owned-source.json' with {type:'json'};
const owners=["js/dashboard-loading-state-presentation.ts", "js/components/DashboardLightSunLoading.svelte", "js/dashboard-insights-presentation.ts", "js/components/DashboardInsights.svelte", "js/components/DashboardInsightCard.svelte", "js/dashboard-insights-projection.ts"] as const;
const root=process.cwd();
function fingerprint(source:string,file:string){const rows=scanDomSinks(source,file),surface=rows.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));return{count:rows.length,digest:createHash('sha256').update(JSON.stringify(surface)).digest('hex'),kinds:Object.fromEntries([...new Set(rows.map(row=>row.kind))].sort().map(kind=>[kind,rows.filter(row=>row.kind===kind).length]))};}
it('retains immutable historical proof and the exact currently reviewed controller sink',()=>{qualifyHistoricalSinkEvidence();qualifyCurrentDomSinkPolicy(candidate);expect(historicalInverse.edits).toHaveLength(6);expect(before.scannedFiles).toBe(1644);expect(inverse.sourceOnlyCleanupDelta.scannedSourceDelta).toBe(0);const file='js/dashboard-widget-renderers.ts',source=readFileSync(path.join(root,file),'utf8');expect(fingerprint(source,file)).toEqual(candidate.files['js/dashboard-widget-renderers.js']);expect(fingerprint(source,file).count).toBe(1);});

it.each(owners)('Dashboard loading/Insights adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
it('detects an unreviewed Svelte raw child',()=>{const file='js/components/DashboardInsights.svelte',source=readFileSync(path.join(root,file),'utf8'),changed=source.replace('</script>',"</script>{@html 'unreviewed-insight'}");expect(changed).not.toBe(source);expect(fingerprint(changed,file).count).toBeGreaterThan(0);});
it('detects a new native controller HTML sink',()=>{const file='js/dashboard-widget-renderers.ts',source=readFileSync(path.join(root,file),'utf8'),changed=source+'\ndocument.body.innerHTML = "unreviewed-dashboard";\n';expect(fingerprint(changed,file).count).toBe(2);expect(fingerprint(changed,file)).not.toEqual(fingerprint(source,file));});

it('rejects a new foreign sink without permitting changes to native sinks',()=>{const file='js/dashboard-widget-renderers.ts',source=readFileSync(path.join(root,file),'utf8'),changed=source+'\ndocument.body.innerHTML = "foreign";\n';expect(fingerprint(changed,file)).not.toEqual(fingerprint(source,file));});

it('accounts for exactly15current Wearable strip and detail sources',()=>{expect(wearablePresentationOwners).toHaveLength(15);});
it.each(wearablePresentationOwners)('Wearable presentation adds no raw HTML sink in %s',file=>{expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);});
