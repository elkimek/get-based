/** Pure ordered presentation values. Services and mutable form state stay in the controller. */
export type ClientFormAvatar = {kind:'image'; source:string} | {kind:'initial'; color:string; initial:string};
export interface ClientFormInput {
  editing:boolean; avatar:ClientFormAvatar; removeAvatar:boolean; readCount:()=>unknown;
  name:unknown; sex:unknown; dob:unknown; country:unknown; zip:unknown; notes:unknown; status:unknown;
  heightUnit:unknown; heightDisplay:unknown; tags:unknown[];
  officialHost:()=>boolean; readHaplogroups:()=>unknown[];
  readSelectedHaplogroup:()=>unknown; readCouplingLabel:()=>unknown;
}
export interface ClientFormView {
  kind:'form'; editing:boolean; avatar:ClientFormAvatar; removeAvatar:boolean; count:string;
  name:string; male:boolean; female:boolean; dob:string; country:string; zip:string; help:string;
  unitAttr:string; unitText:string; height:string; step:string; heightPlaceholder:string; hiddenUnit:string;
  haplogroups:{value:string; selected:boolean; text:string}[]; coupling:string; tags:string[]; notes:string;
  active:boolean; flagged:boolean; archived:boolean;
}
export type ClientFormFragmentView = {kind:'avatar'; avatar:ClientFormAvatar} | {kind:'tag'; text:string};
function text(value:unknown):string {return value===null||value===undefined?'':String(value);}
// Original unescaped template interpolation has a string hint and rejects Symbol.
function rawText(value:unknown):string {return `${value}`;}
// Original option concatenation has the default hint; do not collapse its two reads.
function optionText(value:unknown):string {return ''+value;}
export function projectClientFormAvatar(source:unknown, image:boolean, color:unknown, initial:unknown):ClientFormAvatar {
  return image?{kind:'image',source:text(source)}:{kind:'initial',color:rawText(color),initial:text(initial)};
}
export function projectClientFormTag(value:unknown):ClientFormFragmentView {return {kind:'tag',text:text(value)};}
export function projectClientListForm(input:ClientFormInput):ClientFormView {
  const count=text(input.readCount());
  const name=text(input.name),male=input.sex==='male',female=input.sex==='female',dob=text(input.dob);
  const country=text(input.country),zip=text(input.zip);
  const help=input.officialHost()
    ?'Postal codes are optional and stay in this browser. The hosted app uses country-level latitude rather than sending your postal code through getbased or Vercel; current phone location remains a separate opt-in.'
    :'Postal codes are optional. This self-hosted deployment may ask OpenStreetMap for a privacy-rounded postal area (~11 km); current phone location remains a separate opt-in. © OpenStreetMap contributors.';
  const unitAttr=rawText(input.heightUnit),unitText=rawText(input.heightUnit),height=text(String(input.heightDisplay));
  const step=input.heightUnit==='in'?'0.1':'1',heightPlaceholder=input.heightUnit==='in'?'inches':'cm';
  const hiddenUnit=rawText(input.heightUnit);
  // Native map skips holes. Collect only callbacks actually invoked, in their source order.
  const haplogroups:ClientFormView['haplogroups']=[];
  input.readHaplogroups().map(value=>{const attr=optionText(value);const selected=input.readSelectedHaplogroup()===value;
    const label=optionText(value);haplogroups.push({value:attr,selected,text:label});return '';}).join('');
  const coupling=rawText(input.readCouplingLabel()||'');
  const tags:string[]=[];input.tags.map(value=>{tags.push(text(value));return '';}).join('');
  const notes=text(input.notes),active=input.status==='active',flagged=input.status==='flagged',archived=input.status==='archived';
  return {kind:'form',editing:input.editing,avatar:input.avatar,removeAvatar:input.removeAvatar,count,name,male,female,dob,country,zip,help,
    unitAttr,unitText,height,step,heightPlaceholder,hiddenUnit,haplogroups,coupling,tags,notes,active,flagged,archived};
}
