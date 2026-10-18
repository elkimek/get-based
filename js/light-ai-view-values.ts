import type {AIVerdictStatus}from'./ai-verdict-engine.js';
/**
 * The real server control observes its target once at this producer position.
 * Keep its truthiness and empty-present distinction as literal attributes when
 * a genuine child is composed later. Inactive controls never coerce the target.
 */
export function captureLightAIView<V extends {readonly targetId:string;readonly status:AIVerdictStatus;readonly kind?:string}>(view:V):Readonly<V>&{readonly targetIdPresent?:boolean}{
 if(view.status==='analyzing'||view.kind==='audit-dot')return view;
 const target=view.targetId||undefined;
 return {...view,targetId:target==null?'':String(target),targetIdPresent:target!=null};
}