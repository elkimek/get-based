import {qualifyCurrentDomSinkPolicy,qualifyHistoricalSinkEvidence} from './helpers/dashboard-current-zero-sink-owners.js';
import historicalControllers from './fixtures/wearable-controller-before.json' with {type:'json'};
import {historicalWearableSparklineControllerSource} from './helpers/wearable-strip-sparkline-owned-receipts.js';
import {historicalWearableEmptyControllerSource} from './helpers/wearable-strip-empty-owned-receipts.js';
import {wearablePresentationOwners as owners,historicalWearablePresentationOwners} from './helpers/dashboard-current-zero-sink-owners.js';
import {historicalWearableStripControllerSource} from './helpers/wearable-strip-stub-owned-receipts.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
import rawCandidate from '../scripts/dom-sink-policy.json' with {type:'json'};
import before from './fixtures/wearable-presentation-sink-policy-before.json' with {type:'json'};
import stripInverse from './fixtures/wearable-strip-controller-inverse.json' with {type:'json'};
import detailInverse from './fixtures/wearable-detail-controller-inverse.json' with {type:'json'};

const root=process.cwd(),sha=(text:string)=>createHash('sha256').update(text).digest('hex');
function fingerprint(source:string,file:string){const rows=scanDomSinks(source,file),surface=rows.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));return{count:rows.length,digest:sha(JSON.stringify(surface)),kinds:Object.fromEntries([...new Set(rows.map(row=>row.kind))].sort().map(kind=>[kind,rows.filter(row=>row.kind===kind).length]))};}
type Inverse={sourceBeforeSHA256:string;sourceAfterSHA256:string;edits:{candidateStart:number;candidateEnd:number;after:string;before:string}[]};
function restoreNative(source:string,inverse:Inverse){let result=inverse.sourceAfterSHA256===stripInverse.sourceAfterSHA256?historicalWearableStripControllerSource(historicalWearableEmptyControllerSource(historicalWearableSparklineControllerSource(source))):source;expect(sha(result)).toBe(inverse.sourceAfterSHA256);for(const edit of [...inverse.edits].sort((a,b)=>b.candidateStart-a.candidateStart)){expect(result.slice(edit.candidateStart,edit.candidateEnd)).toBe(edit.after);result=result.slice(0,edit.candidateStart)+edit.before+result.slice(edit.candidateEnd);}expect(sha(result)).toBe(inverse.sourceBeforeSHA256);return result;}
// Immutable retired compiler sources remain explicit history, never runtime owners.
const retiredCompilerHistory={
  "wearable-strip-presentation-compiler-anchors.ts": "36d9ee91ac9da5401c5c84c15e52577800b57e6d8fd4f185d4656ef645780126",
  "wearable-detail-presentation-compiler-anchors.ts": "5f987d0df9d959ce40ddefbd48fe336832f2c9edb7b5a36dfa146da803dcc877",
  "wearable-strip-wearable-metric-card-anchors.ts": "344ff880a5d6078e8949d107cff6eb5ae5036f345795945e8da6bcdff439f18b",
  "wearable-strip-wearable-strip-header-anchors.ts": "66ced99ac7a91bf8cc6e737d9f8925b0006ba3b973bd6dc4b22443edcd9e5a0b",
  "wearable-strip-wearable-strip-body-anchors.ts": "da40c7ed74a7d79207757cedc6db868f1f291a1e96b34364278a24cca46fb0fc",
  "wearable-detail-wearable-detail-chrome-anchors.ts": "0a9f8c0b6e8ea76babb9ba3ffeafa1266d6001a406e778d76d9e6769d194580b",
  "wearable-detail-wearable-manual-entries-anchors.ts": "029094facf5ea602265ba109d98acb780a12d2e389577d1d00beff0dd8800d47",
  "wearable-detail-wearable-detail-stats-anchors.ts": "030a400c5e11c60c565a355afcbad9006befd84684fd1de363bb7e3b8d0dac9e",
  "wearable-detail-wearable-detail-feedback-anchors.ts": "817a61340f280eca4e2800cdde1196a3e8fd17efd9e75edca0a0ca03487de88e"
} as const;
it('preserves immutable 24-owner history while qualifying all actual current source identities and sink fingerprints',()=>{qualifyHistoricalSinkEvidence();expect(historicalWearablePresentationOwners).toHaveLength(24);expect(owners).toHaveLength(15);expect(before.scannedFiles).toBe(1650);qualifyCurrentDomSinkPolicy(rawCandidate);});

it.each(historicalWearablePresentationOwners)('current Wearable owners and pinned retired compiler history add no raw sink: %s',file=>{
 const name=path.basename(file),history=Object.entries(retiredCompilerHistory).find(([retired])=>retired===name);
 if(history){
  const original=readFileSync(path.join(root,'tests/fixtures/wearable-legacy',name),'utf8');
  expect(sha(original)).toBe(history[1]);expect(fingerprint(original,file).count).toBe(0);
  // A retired compiler must stay absent from the real product graph.
  expect(()=>readFileSync(path.join(root,file),'utf8')).toThrow();
 }else expect(fingerprint(readFileSync(path.join(root,file),'utf8'),file).count).toBe(0);
});
it.each([['js/wearables.ts',stripInverse,23,0],['js/wearables-detail-modal.ts',detailInverse,17,1]] as const)('retains the complete native %s inverse and exact sink fingerprint', (file,inverse,edits,sinks)=>{const source=readFileSync(path.join(root,file),'utf8');expect(inverse.edits).toHaveLength(edits);expect(fingerprint(source,file)).toEqual(fingerprint(restoreNative(historicalControllers[file==='js/wearables.ts'?'wearables.ts':'wearables-detail-modal.ts'],inverse),file));expect(fingerprint(source,file).count).toBe(sinks);});
it.each([['js/wearables.ts',stripInverse],['js/wearables-detail-modal.ts',detailInverse]] as const)('rejects any foreign source drift in %s',(file,inverse)=>{expect(()=>restoreNative(historicalControllers[file==='js/wearables.ts'?'wearables.ts':'wearables-detail-modal.ts']+'\n// unqualified foreign change\n',inverse)).toThrow();});
it.each([['js/wearables.ts',0],['js/wearables-detail-modal.ts',1]] as const)('detects any additional actual sink in %s',(file,count)=>{const source=readFileSync(path.join(root,file),'utf8'),changed=source+'\ndocument.body.innerHTML = "unreviewed-wearable";\n';expect(fingerprint(changed,file).count).toBe(count+1);expect(fingerprint(changed,file)).not.toEqual(fingerprint(source,file));});
it('rejects unreviewed raw Svelte child',()=>{const file='js/components/WearableDetailChrome.svelte',source=readFileSync(path.join(root,file),'utf8'),changed=source.replace('</script>',"</script>{@html 'foreign-wearable'}");expect(changed).not.toBe(source);expect(fingerprint(changed,file).count).toBeGreaterThan(0);});
