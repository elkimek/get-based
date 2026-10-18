import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import {dashboardBiometricOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
import current from '../scripts/dom-sink-policy.json' with {type:'json'};
import contract from './fixtures/dashboard-biometric-owned-source.json' with {type:'json'};
const owners=dashboardBiometricOwners;
function fingerprint(source:string,file:string){const sinks=scanDomSinks(source,file),surface=sinks.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));return {count:sinks.length,digest:createHash('sha256').update(JSON.stringify(surface)).digest('hex'),kinds:Object.fromEntries([...new Set(sinks.map(row=>row.kind))].sort().map(kind=>[kind,sinks.filter(row=>row.kind===kind).length]))};}
it('retains immutable native proof and the exact currently reviewed controller surface',()=>{qualifyHistoricalSinkEvidence();expect(contract.domPolicyBefore.sinkCount).toBe(401);expect(Object.keys(contract.domPolicyBefore.files)).toHaveLength(150);expect(contract.scannedDelta).toBe(0);const file='js/dashboard-widget-renderers.ts';expect(fingerprint(readFileSync(path.join(process.cwd(),file),'utf8'),file)).toEqual(current.files['js/dashboard-widget-renderers.js']);});

it.each(owners)('has no raw HTML sink in genuine typed owner %s',file=>{expect(fingerprint(readFileSync(path.join(process.cwd(),file),'utf8'),file).count).toBe(0);});
it('rejects a raw child in the real overview rather than permitting a generic HTML transport',()=>{const file='js/components/DashboardBiometricsOverview.svelte',source=readFileSync(path.join(process.cwd(),file),'utf8'),changed=source.replace('</script>',"</script>{@html 'foreign-biometric-child'}");expect(fingerprint(changed,file).count).toBe(1);});
it('rejects a new foreign controller sink while retaining the native one',()=>{const file='js/dashboard-widget-renderers.ts',source=readFileSync(path.join(process.cwd(),file),'utf8');expect(fingerprint(source+'\ndocument.body.innerHTML="foreign";',file)).not.toEqual(fingerprint(source,file));});
it('qualifies all actual current source identities and sink fingerprints before the five-owner contract',()=>{qualifyCurrentDomSinkPolicy(current);expect(dashboardBiometricOwners).toHaveLength(5);});
