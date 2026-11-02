import { expect, it } from 'vitest';
import { chunkText } from '../js/lens-local-utils.js';
// Compatibility reference from the native prefix-search chunker. The bounded
// implementation must preserve its exact chunks, including straddling separators.
function reference(text: string,maxSize=800,overlap=50,minSize=50) {
 const source=String(text||'').trim();if(source.length<=maxSize)return source.length>=minSize?[source]:[];
 const chunks:string[]=[];let pos=0;
 while(pos<source.length){let end=Math.min(pos+maxSize,source.length);if(end<source.length){for(const sep of ['\n\n','\n','. ',' ']){const index=source.lastIndexOf(sep,end);if(index>pos+minSize){end=index+sep.length;break;}}}const chunk=source.slice(pos,end).trim();if(chunk.length>=minSize)chunks.push(chunk);if(end>=source.length)break;pos=Math.max(end-overlap,pos+1);}
 return chunks;
}
it('preserves exact native chunks across deterministic mixed paragraphs, punctuation, whitespace and overlap',()=>{
 let seed=1739;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let sample=0;sample<180;sample++){
  const parts=Array.from({length:40+Math.floor(random()*120)},()=>['word','\n\n','\n','. ','  ','sentence,','Ω漢字'][Math.floor(random()*7)]!).join('');
  const max=30+Math.floor(random()*770),minimum=1+Math.floor(random()*25),overlap=Math.floor(random()*60);
  expect(chunkText(parts,max,overlap,minimum),`sample ${sample}`).toEqual(reference(parts,max,overlap,minimum));
 }
});
it.each(['\n\n','\n','. ',' '])('retains separators beginning at or straddling the nominal end: %j',separator=>{
 for(const offset of [-2,-1,0,1]){const text='x'.repeat(80+offset)+separator+'continuation '.repeat(30);expect(chunkText(text,80,10,20)).toEqual(reference(text,80,10,20));}
});
it('retains full unbroken passages and short-tail behavior for long single-line sources',()=>{
 for(const source of ['a'.repeat(12000),' '.repeat(60)+'α'.repeat(1700)+'\n\nlast short tail','word. '.repeat(1000)])expect(chunkText(source)).toEqual(reference(source));
});
it('preserves minimum-size boundary cases without choosing an ineligible earlier separator',()=>{
 for(const minimum of [0,1,50,79,80,81,100])expect(chunkText('first word\n\n'+ 'rest '.repeat(100),80,50,minimum)).toEqual(reference('first word\n\n'+ 'rest '.repeat(100),80,50,minimum));
});

it('retains compatibility for previously accepted fractional and unusual tuning arguments',()=>{
 const text='word. '.repeat(50);
 for(const [maximum,overlap,minimum] of [[80.5,10,20],[80,10.5,20],[80,10,20.5],[80,10,-1],[-1,10,20],[80,10,Infinity],[80,10,NaN]])expect(chunkText(text,maximum,overlap,minimum)).toEqual(reference(text,maximum,overlap,minimum));
});
