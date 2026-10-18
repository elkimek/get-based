// Historical data-free compiler frames retained only for retired codec assertions.
import {wearableManualEntriesAnchors as anchors} from './wearable-detail-wearable-manual-entries-anchors.js';
export function renderHTML(props:{kind:keyof typeof anchors}):string{return anchors[props.kind].production.html;}
