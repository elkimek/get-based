import {renderHTML} from './components/EmojiPicker.svelte.html.js';

export interface EmojiCategory {
  readonly id:string; readonly icon:string; readonly label:string; readonly emojis:readonly string[];
}
export interface EmojiPickerView {
  readonly searchValue:string;
  readonly showReset:boolean;
  readonly categories:readonly {readonly id:string;readonly label:string;readonly active:boolean;readonly icon:string}[];
  readonly groups:readonly {readonly label:string;readonly emojis:readonly string[]}[];
}

export function projectEmojiPicker(searchTerm:string,activeCategory:string|null|undefined,
  categories:readonly EmojiCategory[],showReset:()=>boolean|undefined):EmojiPickerView {
  // Preserve search coercion before reading opts.showReset; Svelte owns encoding.
  const searchValue=searchTerm == null ? '' : String(searchTerm);
  const reset=!!showReset();
  const buttons:Array<EmojiPickerView['categories'][number]>=[];
  for(const category of categories)buttons.push({id:`${category.id}`,label:`${category.label}`,
    active:activeCategory===category.id,icon:`${category.icon}`});
  const groups:Array<EmojiPickerView['groups'][number]>=[];
  for(const category of categories){
    if(activeCategory&&activeCategory!==category.id)continue;
    if(searchTerm&&!category.label.toLowerCase().includes(searchTerm.toLowerCase()))continue;
    const label=`${category.label}`,emojis:string[]=[];
    for(const emoji of category.emojis)emojis.push(`${emoji}`);
    groups.push({label,emojis});
  }
  if(!groups.length)groups.push({label:'No results',emojis:[]});
  return {searchValue,showReset:reset,categories:buttons,groups};
}

/** Public synchronous serializer; all feature structure is owned by the component. */
export function renderEmojiPicker(searchTerm:string,activeCategory:string|null|undefined,
  categories:readonly EmojiCategory[],showReset:()=>boolean|undefined):string {
  return renderHTML({view:projectEmojiPicker(searchTerm,activeCategory,categories,showReset)});
}
