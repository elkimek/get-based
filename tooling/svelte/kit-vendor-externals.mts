import type {Plugin} from 'vite';
import {qualifyBrowserVendorAssets} from '../../scripts/browser-vendor-contracts.mjs';

/** External browser URLs are invalid Node module IDs. Keep this plugin out of
 * SSR, prerender and every non-client environment rather than rewriting them. */
export function isKitClientEnvironment(environment:{name:string;config:{consumer?:'client'|'server'}}):boolean {
 return environment.name==='client'&&environment.config.consumer==='client';
}
export function createKitVendorExternals(options:Parameters<typeof qualifyBrowserVendorAssets>[0]):Plugin {
 let qualified:ReturnType<typeof qualifyBrowserVendorAssets>|undefined;
 const vendors=()=>qualified??=qualifyBrowserVendorAssets(options);
 return{
  name:'getbased-exact-kit-vendor-externals',apply:'build',enforce:'pre',
  applyToEnvironment:isKitClientEnvironment,
  async buildStart(){await vendors();},
  async resolveId(source,importer){
   const asset=(await vendors()).resolve(source,importer);
   // Absolute public URLs must survive chunk-relative output rewriting. All
   // five complete immutable files are copied and measured in APP_SHELL.
   return asset?{id:asset.url,external:'absolute'}:null;
  },
 };
}
