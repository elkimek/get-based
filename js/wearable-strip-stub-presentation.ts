import {renderHTML} from './components/WearableStripStub.svelte.html.js';
export interface WearableStripStubView {
 readonly connectAction:'open-settings-wearables';readonly dismissAction:'dismiss-stub';
}
/** Keep the native helper's finite fixed-action ABI; it supplies no arbitrary attributes. */
export function projectWearableStripStubActions(connect:string,dismiss:string):WearableStripStubView {
 if(connect!=='data-wearable-action="open-settings-wearables"'||dismiss!=='data-wearable-action="dismiss-stub"')throw new Error('Unqualified native wearable discovery actions');
 return {connectAction:'open-settings-wearables',dismissAction:'dismiss-stub'};
}
/** Genuine inert discovery nodes; native wearable delegates remain their sole action owner. */
export function renderWearableStripStubPresentation(view:WearableStripStubView):string {return renderHTML({view});}
