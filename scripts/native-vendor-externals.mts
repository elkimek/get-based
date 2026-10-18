import path from 'node:path';
import type {Plugin} from 'rolldown';
import {qualifyBrowserVendorAssets} from './browser-vendor-contracts.mjs';
// Keep the native builder's public contract stable. Vite's separately installed
// Rolldown types stay in its own tooling module; only plain data is shared.
export {BROWSER_VENDOR_SDKS as NATIVE_VENDOR_SDKS} from './browser-vendor-contracts.mjs';
export type {BrowserVendorAsset as NativeVendorAsset} from './browser-vendor-contracts.mjs';
export async function createNativeVendorExternals(options:Parameters<typeof qualifyBrowserVendorAssets>[0]) {
 const vendors=await qualifyBrowserVendorAssets(options),paths:Record<string,string>={};
 for(const asset of vendors.assets)paths[path.resolve(options.root,asset.file)]='../'+asset.file;
 const plugin:Plugin={
  name:'getbased-exact-native-vendor-externals',
  resolveId(source,importer){
   const asset=vendors.resolve(source,importer);
   return asset?{id:path.resolve(options.root,asset.file),external:true}:null;
  },
 };
 return{plugin,paths,assets:vendors.assets,assertShell:vendors.assertShell};
}
