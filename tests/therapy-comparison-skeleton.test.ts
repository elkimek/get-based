import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const owners=["TherapyComparisonResults", "TherapyComparisonEntries", "MarkerPairComparison"];
it.each(owners)('%s is a genuine finite child owner',name=>{const source=readFileSync('js/components/'+name+'.svelte','utf8');expect(source).toContain('$props()');expect(source).not.toContain('@html');expect(source).not.toMatch(/compiler-anchor|gb-(?:compare|corr|therapy)-(?:slot|child|private)|data-(?:compare|corr|therapy)-private/);});
import {renderMarkerPairComparison} from '../js/therapy-comparison-presentation.js';
import {prepareTherapyHistory,prepareTherapyComparison} from '../js/therapy-correlations.js';
it('keeps explicit public raw marker date/formatter compatibility separately from ordinary genuine nodes',()=>{const history=prepareTherapyHistory({id:'fixture',name:'Fixture',periods:[]},'2026-10-12');const pair={...prepareTherapyComparison({history,marker:{name:'Marker',unit:'Unit',values:[]},markerKey:'test.marker',dates:[]}),pairKey:'fixture'};pair.markerName='gb-therapy-slot2 <b><!--[0-->';const html=renderMarkerPairComparison(pair,'data',()=>'' );expect(html).toContain('gb-therapy-slot2 &lt;b&gt;&lt;!--[0--&gt;');expect(html).toContain('<details open>');expect(html).not.toContain('data-therapy-private');});
