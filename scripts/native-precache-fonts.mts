import {parseAppShellEntries} from './app-shell-budget.mjs';
import {planPrecacheFontAssets} from './font-assets.mjs';

/** Native build artifacts use source-root fallback for unchanged public assets.
 * Share Kit's byte-proven font plan; every non-font URL remains in the shell. */
export async function applyNativeFontPrecache(worker:string,sourceRoot:string):Promise<string> {
 const marker='const FONT_ALIASES = {};';
 if(worker.split(marker).length!==2)throw new Error('Missing unique native worker font-alias injection point');
 const original=parseAppShellEntries(worker),plan=await planPrecacheFontAssets(original,sourceRoot);
 return worker.replace(marker,`const FONT_ALIASES = ${JSON.stringify(plan.aliases)};`)
  .replace(/const APP_SHELL = \[[\s\S]*?\];/,`const APP_SHELL = ${JSON.stringify(plan.urls,null,2)};`);
}
