import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
import policy from '../scripts/dom-sink-policy.json' with {type:'json'};
const owners=['CompareDatesPage','CompareDatesTable','CompareDatesTableHeader','CompareDatesTableRows','CompareRangeStack','CorrelationsSelectionPage','CorrelationsSelectionOptions','CorrelationsSelectionChips','TherapyComparisonResults','TherapyComparisonEntries','MarkerPairComparison'];
it.each(owners)('%s owns genuine nodes and rejects an added raw child sink',name=>{const file='js/components/'+name+'.svelte',source=readFileSync(file,'utf8');expect(scanDomSinks(source,file)).toEqual([]);expect(scanDomSinks(source+"\n{@html 'foreign-raw-child'}",file)).toHaveLength(1);});
it.each(['compare-correlations','therapy-correlation-view'])('%s retains its native explicit assignment count and kinds',name=>{const file='js/'+name+'.ts',source=readFileSync(file,'utf8'),sinks=scanDomSinks(source,file);const original=policy.files['js/'+name+'.js' as keyof typeof policy.files];expect(sinks).toHaveLength(original.count);expect(Object.fromEntries([...new Set(sinks.map(sink=>sink.kind))].sort().map(kind=>[kind,sinks.filter(sink=>sink.kind===kind).length]))).toEqual(original.kinds);expect(scanDomSinks(source+'\ndocument.body.innerHTML="foreign";',file)).toHaveLength(original.count+1);});
