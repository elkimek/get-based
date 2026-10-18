import type {Component} from 'svelte';
import type {ChatEmptyView} from '../chat-empty-presentation.js';
import type {ContextCatalogView} from '../context-card-catalog-presentation.js';
declare const component:Component<{view:ChatEmptyView;contextCatalog?:ContextCatalogView|null},{setCatalog(view:ContextCatalogView|null):void}>;
export default component;
export {hydrate,mount,unmount,flushSync} from 'svelte';
