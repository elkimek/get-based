import fs from'node:fs';import{expect,it}from'vitest';import*as ts from'typescript/unstable/ast';
import{scanDomSinks}from'../scripts/dom-sink-audit.mjs';import{withParsedSource}from'../scripts/native-typescript-ast.js';
const owners=[
 'js/wearables-entry-presentation.ts','js/components/WearableManualLog.svelte','js/components/WearableSourcePicker.svelte',
 'js/components/WearableManualTags.svelte','js/components/WearableManualNote.svelte','js/components/WearableSourceRow.svelte','js/components/WearableSourceCheck.svelte',
 'js/wearable-strip-presentation.ts','js/wearable-detail-presentation.ts',
 'js/wearable-strip-empty-presentation.ts','js/wearable-strip-sparkline-presentation.ts','js/wearable-strip-stub-presentation.ts',
 'js/components/WearableMetricCard.svelte','js/components/WearableStripHeader.svelte','js/components/WearableStripBody.svelte',
 'js/components/WearableDetailChrome.svelte','js/components/WearableDetailFeedback.svelte','js/components/WearableDetailStats.svelte',
 'js/components/WearableEmptyCard.svelte','js/components/WearableManualEntries.svelte','js/components/WearableSparkline.svelte','js/components/WearableStripStub.svelte',
]as const;
const read=(file:string)=>fs.readFileSync(file,'utf8');
it.each(owners)('keeps current genuine Wearables owner sink-free: %s',file=>{expect(scanDomSinks(read(file),file)).toEqual([]);});
it.each(owners)('rejects an actual new raw child or imperative sink in current %s',file=>{
 const current=read(file),changed=file.endsWith('.svelte')?current+"{@html '<em>unreviewed</em>'}":current+'\ndocument.body.innerHTML = input;\n';
 expect(scanDomSinks(changed,file)).toHaveLength(1);
});
it('keeps the current strip controller sink-free and detects an additional imperative sink',()=>{
 const file='js/wearables.ts',source=read(file);expect(scanDomSinks(source,file)).toEqual([]);expect(scanDomSinks(source+'\ndocument.body.innerHTML = input;\n',file)).toHaveLength(1);
});
it('keeps the sole current native detail insertion bound directly to its genuine local serializer',()=>{
 const file='js/wearables-detail-modal.ts',source=read(file);expect(scanDomSinks(source,file)).toHaveLength(1);
 const check=(text:string)=>withParsedSource(text,file,parsed=>{
  let found=0;
  function visit(node:ts.Node):void{
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&node.left.name.text==='innerHTML'){
    expect(node.left.expression.getText(parsed)).toBe('modal');expect(ts.isCallExpression(node.right)).toBe(true);
    if(!ts.isCallExpression(node.right))throw new Error('Native detail must call its genuine serializer directly');
    expect(node.right.expression.getText(parsed)).toBe('buildWearableDetailHtml');found++;
   }node.forEachChild(visit);
  }visit(parsed);expect(found).toBe(1);
 });
 check(source);expect(()=>check(source.replace('modal.innerHTML = buildWearableDetailHtml(', 'modal.innerHTML = foreignRenderer('))).toThrow();
 expect(()=>check(source+'\ndocument.body.innerHTML = input;\n')).toThrow();
 expect(scanDomSinks(source+'\ndocument.body.innerHTML = input;\n',file)).toHaveLength(2);
});
