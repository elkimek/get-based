import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {scanDomSinks} from '../scripts/dom-sink-audit.mjs';
const components=['CategoryPageChrome','CategoryPageViewBody','CategoryPageRangeEmptyState','CategoryMarkerDataGaps','CategoryGlyph','CategoryRangeRail','CategoryChartCard','CategoryTableColgroup','CategoryScrollableTable','CategoryDataTable','CategoryHeatmap','CategoryFattyAcids','CategoryTableHeader','CategoryRangeText','CategoryDataRows','CategoryHeatmapRows'];
it.each(components)('%s contains no raw child HTML sink',name=>{const file='js/components/'+name+'.svelte',source=readFileSync(file,'utf8');expect(scanDomSinks(source,file)).toEqual([]);expect(scanDomSinks(source+"\n{@html 'unqualified'}",file).length).toBeGreaterThan(0);});
it('thin readonly facades add no HTML sink',()=>{for(const file of ['js/category-presentation.ts','js/category-page-presentation.ts'])expect(scanDomSinks(readFileSync(file,'utf8'),file)).toEqual([]);});
it('Category controller retains its seven explicit native DOM assignments and rejects an added write',()=>{const file='js/category-page-view.ts',source=readFileSync(file,'utf8'),sinks=scanDomSinks(source,file);expect(sinks).toHaveLength(7);expect(sinks.every(sink=>sink.kind==='innerHTML')).toBe(true);expect(scanDomSinks(source+'\ndocument.body.innerHTML="foreign";',file)).toHaveLength(8);});
