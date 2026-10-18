import {renderHTML} from './components/WearableSparkline.svelte.html.js';
/** Primitive snapshots retain each native interpolation, including repeated baseline coercion. */
export interface WearableSparklineView {
 readonly toneClass:string;readonly width:string;readonly height:string;
 readonly baselineStartY:string;readonly baselineWidth:string;readonly baselineEndY:string;
 readonly points:string;readonly lastX:string;readonly lastY:string;
}
/** Genuine SVG nodes; native math and custom series operations remain the controller's responsibility. */
export function renderWearableSparklinePresentation(view:WearableSparklineView):string {return renderHTML({view});}
