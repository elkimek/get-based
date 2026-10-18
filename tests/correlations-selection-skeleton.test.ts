import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const owners=["CorrelationsSelectionPage", "CorrelationsSelectionOptions", "CorrelationsSelectionChips"];
it.each(owners)('%s is a genuine finite child owner',name=>{const source=readFileSync('js/components/'+name+'.svelte','utf8');expect(source).toContain('$props()');expect(source).not.toContain('@html');expect(source).not.toMatch(/compiler-anchor|gb-(?:compare|corr|therapy)-(?:slot|child|private)|data-(?:compare|corr|therapy)-private/);});
import {renderCorrelationTherapyChip} from '../js/correlations-selection-presentation.js';
it('keeps literal conversion and raw public delegated attributes without a child codec',()=>{const html=renderCorrelationTherapyChip({name:'gb-corr-chip-label <script><!--[0-->'},()=> 'data-compare-action="toggle-therapy" data-compare-key="gb-corr-chip-aria"');expect(html).toContain('gb-corr-chip-label &lt;script&gt;&lt;!--[0--&gt;');expect(html).toContain('data-compare-key="gb-corr-chip-aria"');expect(html).toContain('&times;');});
