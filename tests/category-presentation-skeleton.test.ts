import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const owners=['CategoryRangeRail','CategoryChartCard','CategoryTableColgroup','CategoryScrollableTable','CategoryDataTable','CategoryHeatmap','CategoryFattyAcids','CategoryTableHeader','CategoryDataRows','CategoryHeatmapRows','CategoryRangeText'];
it.each(owners)('%s is a genuine typed owner with no child HTML protocol',name=>{
 const source=readFileSync('js/components/'+name+'.svelte','utf8');expect(source).toContain('$props()');expect(source).not.toContain('@html');expect(source).not.toMatch(/gb-category-|compiler-anchor|NativePort|coordinate/);
});
it('Category controller and facade have no compiler anchors or callback HTML ports',()=>{for(const file of ['js/category-view-renderers.ts','js/category-presentation.ts']){const source=readFileSync(file,'utf8');expect(source).not.toMatch(/renderCategoryPresentation|categoryPresentationAnchors|NativePort|nativeSkeleton/);}const source=readFileSync('js/category-view-renderers.ts','utf8');expect(source.match(/return renderScrollableTableShell/g)).toBeNull();});
