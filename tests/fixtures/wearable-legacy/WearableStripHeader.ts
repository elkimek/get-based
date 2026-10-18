// Historical data-free compiler frames retained only for retired codec assertions.
import {wearableStripHeaderAnchors as anchors} from './wearable-strip-wearable-strip-header-anchors.js';
export function renderHTML(props:{kind:keyof typeof anchors}):string{return anchors[props.kind].production.html;}
