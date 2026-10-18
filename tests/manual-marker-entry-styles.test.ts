import {compileMarkerDetailCompleteStyles as compileManualMarkerEntryStyles} from '../scripts/marker-detail-complete-style-ownership.mjs';
import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import {fileURLToPath} from 'node:url';
import {manualMarkerEntryOwnership} from '../scripts/manual-marker-entry-style-ownership.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputPath=path.join(root,'css/marker-detail-modal.base.css');
describe('manual marker form Tailwind declaration ownership',()=>{
  it('expands every shared native receiver with exact declarations/media/order and byte-preserved foreign source',async()=>{
    const input=await fs.readFile(inputPath,'utf8');
    const result=await compileManualMarkerEntryStyles(input,inputPath,root);
    expect(result.receivers.filter(row=>manualMarkerEntryOwnership.receivers.some(([name])=>name===row.utility))).toHaveLength(16);
    expect(manualMarkerEntryOwnership.declarationCount).toBe(64);
    let restored=result.css;
    for(const edit of [...result.edits].sort((a,b)=>b.start-a.start)) {
      // Each engine edit independently proves its exact source coordinate.
      expect(input.slice(edit.start,edit.end)).toBe(edit.before);
    }
    // Returned css must be exactly the engine's disjoint ordered edits, nothing else.
    restored=input;
    for(const edit of [...result.edits].sort((a,b)=>b.start-a.start)) restored=restored.slice(0,edit.start)+edit.after+restored.slice(edit.end);
    expect(result.css).toBe(restored);
    const tree=postcss.parse(result.css);
    expect(tree.nodes.some(n=>n.type==='atrule'&&(n.name==='utility'||n.name==='import'))).toBe(false);
    expect(result.css).toContain('.manual-entry-btn:hover');
    expect(result.css).toContain('.marker-detail-modal .marker-note-editor textarea');
  });
  it('rejects unknown extra owned applies instead of changing another consumer',async()=>{
    const input=await fs.readFile(inputPath,'utf8');
    await expect(compileManualMarkerEntryStyles(input+'\n.bad { @apply gb:manual-entry-form; }',inputPath,root)).rejects.toThrow();
  });
});
