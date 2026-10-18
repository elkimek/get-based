/** Captured text and policy links; controllers retain consent lifecycle ownership. */
export interface ConsentPolicyLink {readonly label:string;readonly url:string}
export interface ConsentPolicyGroup {readonly leadingBreak:boolean;readonly label:string;readonly links:readonly ConsentPolicyLink[]}
interface ConsentCopy {readonly title:string;readonly description:string;readonly statement:string;readonly approveLabel:string}
export type LegalConsentView=
 | (ConsentCopy & Readonly<{kind:'cloud';kicker:string;titleId:string;descriptionId:string;checkboxId:string;points:readonly string[];policyGroups:readonly ConsentPolicyGroup[];cancelLabel:string;remote:boolean}>)
 | (ConsentCopy & Readonly<{kind:'wearable';purpose:string;withdrawal:string}>);
/** Match native textContent conversion, including its Symbol refusal. */
export function consentDOMText(value:unknown,ownerDocument?:Document):string {
 if(value===null||value===undefined)return '';
 if(typeof value==='symbol'){
  if(ownerDocument)Reflect.set(ownerDocument.createTextNode(''),'textContent',value);
  throw new TypeError('Cannot convert a Symbol value to a string');
 }
 return String(value);
}
export function consentDOMAttribute(value:unknown,ownerDocument?:Document):string {
 if(typeof value==='symbol'){
  if(ownerDocument)Reflect.set(ownerDocument.createElement('a'),'href',value);
  throw new TypeError('Cannot convert a Symbol value to a string');
 }
 return String(value);
}
