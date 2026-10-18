// Historical data-free compiler frames retained only for retired codec assertions.
import {wearableMetricCardAnchors as anchors} from './wearable-strip-wearable-metric-card-anchors.js';
export function renderHTML(props:{kind:keyof typeof anchors}):string{return anchors[props.kind].production.html;}
