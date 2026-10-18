import postcss from 'postcss';
/** Qualify all current EMF selector/media positions and ordered declaration
 * values/priorities before transporting only body formatting to frozen native
 * bytes. Extra/missing/reordered rules, declarations or ancestry remain errors. */
export function restoreEMFStyleBodies(current:string,original:string):string {
 const live=postcss.parse(current),native=postcss.parse(original);
 const rules=(root:postcss.Root)=>{const result:postcss.Rule[]=[];root.walkRules(rule=>{result.push(rule);});return result;};
 const a=rules(live),b=rules(native);if(a.length!==115||b.length!==115)throw new Error('Exactly all115 reviewed EMF receivers');
 const ancestry=(rule:postcss.Rule)=>{const result:unknown[]=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent){if(p.type!=='atrule')throw new Error('Only declared native media ancestry');result.unshift([p.name,p.params]);}return result;};
 const signature=(rule:postcss.Rule)=>({selector:rule.selector,ancestry:ancestry(rule),declarations:rule.nodes.map(node=>{if(node.type!=='decl')throw new Error('Only exact ordered EMF declarations');return[node.prop,node.value,node.important===true];})});
 const body=(rule:postcss.Rule,text:string)=>{const start=rule.source?.start?.offset,end=rule.source?.end?.offset;if(typeof start!=='number'||typeof end!=='number'||text.slice(start,end)!==rule.toString())throw new Error('Exact native EMF rule framing');const open=start+rule.selector.length+(rule.raws.between||'').length;if(text[open]!=='{'||text[end-1]!=='}')throw new Error('Exact native body boundaries');return{start:open+1,end:end-1};};
 const edits=a.map((rule,index)=>{const target=b[index]!;if(JSON.stringify(signature(rule))!==JSON.stringify(signature(target)))throw new Error('Exact complete EMF selector/media/declaration order/value/priority');const to=body(rule,current),from=body(target,original);return{...to,after:original.slice(from.start,from.end)};});
 let result=current;for(const edit of edits.sort((x,y)=>y.start-x.start))result=result.slice(0,edit.start)+edit.after+result.slice(edit.end);return result;
}
