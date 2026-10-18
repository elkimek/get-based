import assert from 'node:assert/strict';
interface Input {scope:string;kind:string;override?:string}
export function expectedWearableEntryHTML(input:Input, original:string):string {
  if (!original) return original;
  let html=original.replace(/&gt;|&#39;/g,entity=>entity==='&gt;'?'>':"'").replace(/<input\b[^>]*>/g,tag=>tag.endsWith('/>')?tag:tag.slice(0,-1)+'/>');
  const once=(before:string,after:string)=>{assert.equal(html.split(before).length,2,'Expected-only native grammar target');html=html.replace(before,after);};
  if(input.scope==='picker'){
    html=html.replace(/(<button[^>]* data-source="([^"]*)">)([\s\S]*?)(<\/button>)/g,(_whole,opening:string,id:string,body:string,closing:string)=>{
      const indent=id?'        ':'      ',closeIndent=id?'      ':'    ';
      const boundary='\n'+indent,at=body.lastIndexOf(boundary);assert.ok(at>=0);
      const content=body.slice(at+boundary.length,body.length-('\n'+closeIndent).length);
      const selected=id?id==='one':!input.override;
      assert.equal(content,selected?'<span class="wearable-source-picker-check">✓</span>':'');
      return opening+body.slice(0,at)+boundary+(selected?'<!--[0-->':'<!--[-1-->')+content+'<!--]-->'+'\n'+closeIndent+closing;
    });
    once(' source</div>\n    <button',' source</div>\n    <!--[--><button');
    once('</button>\n    <button type="button" class="wearable-source-picker-item wearable-source-picker-auto"','</button><!--]-->\n    <button type="button" class="wearable-source-picker-item wearable-source-picker-auto"');
    return '<!--[--><!--[0-->'+html+'<!--]--><!--]-->';
  }
  const form=input.scope==='strip'||input.scope==='detail';
  const tags=input.scope==='tags'||form&&input.kind!=='weight';
  if(tags){
    once('<div class="wearable-log-tags" role="group" aria-label="Optional context">\n    ', '<!--[0--><div class="wearable-log-tags" role="group" aria-label="Optional context">\n    <!--[-->');
    once('</button>\n  </div>','</button><!--]-->\n  </div><!--]-->');
  }
  if(form){
    once('<textarea class="wearable-log-note"','<!--[0--><textarea class="wearable-log-note"');
    once('</textarea>','</textarea><!--]-->');
  }
  const kind=input.kind.startsWith('bp_')?'bp':input.kind;
  const mode=input.scope==='tags'?'tags':input.scope==='note'?'note':input.scope+'-'+kind;
  const index=['strip-weight','strip-bp','strip-rhr','detail-weight','detail-rhr','detail-bp','tags','chip','note'].indexOf(mode);
  assert.ok(index>=0,'Expected native scope');
  return '<!--[--><!--['+index+'-->'+html+'<!--]--><!--]-->';
}
