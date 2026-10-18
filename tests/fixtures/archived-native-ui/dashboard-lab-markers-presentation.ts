import { renderHTML as renderDashboardLabMarkers } from './components/DashboardLabMarkers.svelte.html.js';
import { dashboardLabMarkersPresentationAnchors } from './dashboard-lab-markers-presentation-compiler-anchors.js';

type NativePort = () => unknown;
export interface DashboardLabMarkersPresentationPorts {
  renderDashboardSingleMarkerWidget: {
    "single-marker": { statusClass: NativePort; detailAction: NativePort; accessibleLabel: NativePort; dotStatus: NativePort; name: NativePort; value: NativePort; unitMarkup: NativePort; trendArrow: NativePort; sparkline: NativePort; reason: NativePort; };
    "single-marker-unit": { unit: NativePort; };
  };
  renderDashboardSpotlightWidget: {
    "spotlight": { detailAction: NativePort; accessibleLabel: NativePort; name: NativePort; range: NativePort; priority: NativePort; value: NativePort; unit: NativePort; sparkline: NativePort; };
  };
  renderLabsPriorityBanner: {
    "priority": { statusClass: NativePort; detailAction: NativePort; accessibleLabel: NativePort; dotStatus: NativePort; name: NativePort; priority: NativePort; sparkline: NativePort; value: NativePort; unit: NativePort; };
  };
}

type Owner = keyof DashboardLabMarkersPresentationPorts;
interface FixedEdit { readonly start: number; readonly end: number; readonly before: string; readonly after: string; }
interface CompilerFrame { readonly html: string; readonly prefix: string; readonly suffix: string; readonly edits: readonly FixedEdit[]; }
interface NativeAnchor {
  readonly slots: readonly { readonly coordinate: string; readonly port: string }[];
  readonly nativeSkeleton: string;
  readonly production: CompilerFrame;
  readonly development: CompilerFrame;
}
const renderers = {
  renderDashboardSingleMarkerWidget: (kind: string) => renderDashboardLabMarkers({ kind: kind as "single-marker" | "single-marker-unit" }),
  renderDashboardSpotlightWidget: (kind: string) => renderDashboardLabMarkers({ kind: kind as "spotlight" }),
  renderLabsPriorityBanner: (kind: string) => renderDashboardLabMarkers({ kind: kind as "priority" }),
};

/**
 * Svelte owns the complete marker, spotlight and priority layouts. Its exact compiler
 * frame is restored. Named callbacks run once at the original interpolation
 * point and in original order; data is inserted once and never rescanned.
 */
export function renderDashboardLabMarkersPresentation<
  O extends Owner, K extends keyof DashboardLabMarkersPresentationPorts[O] & string,
>(owner: O, kind: K, ports: DashboardLabMarkersPresentationPorts[O][K]): string {
  const ownerAnchors: Readonly<Record<string, NativeAnchor>> = dashboardLabMarkersPresentationAnchors[owner];
  const anchor = ownerAnchors[kind];
  if (!anchor) throw new Error('Unqualified Dashboard Labs Markers presentation branch');
  const callbacks = ports as Readonly<Record<string, NativePort>>;
  if (Object.keys(callbacks).length !== anchor.slots.length) {
    throw new Error('Unqualified Dashboard Labs Markers presentation ports');
  }
  const compiled = renderers[owner](kind);
  const frame = compiled === anchor.production.html ? anchor.production
    : compiled === anchor.development.html ? anchor.development : null;
  if (!frame) throw new Error('Unqualified complete Dashboard Labs Markers compiler frame');
  let skeleton = compiled.slice(frame.prefix.length, -frame.suffix.length);
  for (let i = frame.edits.length - 1; i >= 0; i--) {
    const edit = frame.edits[i]!;
    if (skeleton.slice(edit.start, edit.end) !== edit.before) {
      throw new Error('Unqualified fixed Dashboard Labs Markers source lexeme');
    }
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
  }
  if (skeleton !== anchor.nativeSkeleton) throw new Error('Unqualified native Dashboard Labs Markers skeleton');

  let cursor = 0;
  let output = '';
  for (const slot of anchor.slots) {
    const start = skeleton.indexOf(slot.coordinate, cursor);
    if (start < cursor || skeleton.indexOf(slot.coordinate, start + slot.coordinate.length) !== -1) {
      throw new Error('Unqualified private Dashboard Labs Markers coordinate');
    }
    const callback = callbacks[slot.port];
    if (typeof callback !== 'function') throw new Error('Unqualified named Dashboard Labs Markers port');
    // Native template interpolation uses the string hint and rejects Symbols.
    // Repeated marker getter expressions retain their original chronology.
    const value = `${callback()}`;
    output += skeleton.slice(cursor, start) + value;
    cursor = start + slot.coordinate.length;
  }
  return output + skeleton.slice(cursor);
}
