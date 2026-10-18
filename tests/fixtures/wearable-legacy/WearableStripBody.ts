// Historical data-free compiler frames retained only for retired codec assertions.
import {wearableStripBodyAnchors as anchors} from './wearable-strip-wearable-strip-body-anchors.js';
export function renderHTML(props:{kind:keyof typeof anchors}):string{return anchors[props.kind].production.html;}
