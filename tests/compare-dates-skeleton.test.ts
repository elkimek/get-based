import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const owners=["CompareDatesPage", "CompareDatesTable", "CompareDatesTableHeader", "CompareDatesTableRows", "CompareRangeStack"];
it.each(owners)('%s is a genuine finite child owner',name=>{const source=readFileSync('js/components/'+name+'.svelte','utf8');expect(source).toContain('$props()');expect(source).not.toContain('@html');expect(source).not.toMatch(/compiler-anchor|gb-(?:compare|corr|therapy)-(?:slot|child|private)|data-(?:compare|corr|therapy)-private/);});
import {renderCompareOption,renderCompareCategory} from '../js/compare-dates-presentation.js';
it('retains explicit public raw option/glyph compatibility without a compiler protocol',()=>{const raw='"gb-compare-date-label" <!--[0-->';expect(renderCompareOption(raw,'label')).toBe('<option value="'+raw+'">label</option>');const glyph='<!---->gb-compare-glyph<!----><!--unterminated';const html=renderCompareCategory('x',{label:'gb-compare-category',markers:{}},()=>glyph);expect(html).toContain(glyph);expect(html).toContain('<span>gb-compare-category</span>');});
