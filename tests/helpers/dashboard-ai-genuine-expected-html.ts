import {JSDOM} from 'jsdom';

/**
 * Expected side only: promote the immutable native roots to genuine SSR.
 * Retain every expected attribute/text/node in order; only spelling of encoded
 * text and the exact owned root comments changes. Actual output is untouched.
 */
export function expectedDashboardAIHTML(nativeMarkup:string):string {
  const dom=new JSDOM('');
  try{
    const template=dom.window.document.createElement('template');template.innerHTML=nativeMarkup;
    const text=(value:string):string=>value.replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');
    const attribute=(value:string):string=>text(value).replace(/"/g,'&quot;');
    function nodeHTML(node:Node):string {
      if(node.nodeType===3)return text(node.nodeValue||'');
      if(node.nodeType===8)return '<!--'+node.nodeValue+'-->';
      if(!(node instanceof dom.window.Element))throw new Error('Unexpected retained Dashboard AI node');
      const tag=node.localName;
      return '<'+tag+[...node.attributes].map(attr=>' '+attr.name+'="'+attribute(attr.value)+'"').join('')+'>'
        +[...node.childNodes].map(nodeHTML).join('')+'</'+tag+'>';
    }
    return [...template.content.childNodes].map(node=>{
      if(!(node instanceof dom.window.Element)||!node.matches('div.lens-section,button.dashboard-cta'))
        throw new Error('Unexpected retained Dashboard AI root');
      return '<!--[-->'+nodeHTML(node)+'<!--]-->';
    }).join('');
  }finally{dom.window.close();}
}
/** Byte-exact independent test guard; no runtime compiler authentication. */
export function requireDashboardAIGraph(actual:string,expected:string):void {
  if(actual!==expected)throw new Error('Changed genuine Dashboard AI graph');
}
