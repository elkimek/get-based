import { renderHTML as renderDashboardBiometricSyncStatus } from './components/DashboardBiometricSyncStatus.svelte.html.js';
import { renderHTML as renderDashboardBiometricTile } from './components/DashboardBiometricTile.svelte.html.js';
import { renderHTML as renderDashboardBiometricsOverview } from './components/DashboardBiometricsOverview.svelte.html.js';
import { dashboardBiometricPresentationAnchors } from './dashboard-biometric-presentation-compiler-anchors.js';

type NativePort = () => unknown;
export interface DashboardBiometricPresentationPorts {
  renderDashboardBiometricSyncStatus: {
    "status": { staleClass: NativePort; label: NativePort; syncAction: NativePort; };
    "sync-action": { actionAttributes: NativePort; };
  };
  renderDashboardBiometricTile: {
    "remove": { actionAttributes: NativePort; label: NativePort; };
    "manual-empty": { metricId: NativePort; actionAttributes: NativePort; accessibleLabel: NativePort; label: NativePort; removeAction: NativePort; };
    "populated": { actionAttributes: NativePort; accessibleLabel: NativePort; label: NativePort; value: NativePort; unit: NativePort; change: NativePort; removeAction: NativePort; };
  };
  renderDashboardWearableTilesWidget: {
    "toolbar": { count: NativePort; pluralSuffix: NativePort; syncStatus: NativePort; pickerActionAttributes: NativePort; };
    "empty": { toolbar: NativePort; };
    "grid": { toolbar: NativePort; tiles: NativePort; };
  };
}

type Owner = keyof DashboardBiometricPresentationPorts;
interface FixedEdit { readonly start: number; readonly end: number; readonly before: string; readonly after: string; }
interface CompilerFrame { readonly html: string; readonly prefix: string; readonly suffix: string; readonly edits: readonly FixedEdit[]; }
interface NativeAnchor {
  readonly slots: readonly { readonly coordinate: string; readonly port: string }[];
  readonly nativeSkeleton: string;
  readonly production: CompilerFrame;
  readonly development: CompilerFrame;
}
const renderers = {
  renderDashboardBiometricSyncStatus: (kind: string) => renderDashboardBiometricSyncStatus({ kind: kind as "status" | "sync-action" }),
  renderDashboardBiometricTile: (kind: string) => renderDashboardBiometricTile({ kind: kind as "remove" | "manual-empty" | "populated" }),
  renderDashboardWearableTilesWidget: (kind: string) => renderDashboardBiometricsOverview({ kind: kind as "toolbar" | "empty" | "grid" }),
};

/**
 * Each Svelte owner supplies valid complete markup, including declared framing
 * for native incrementally assembled rows and cards. Only its exact compiler
 * frame is restored. Named callbacks run once at the original interpolation
 * point and in original order; data is inserted once and never rescanned.
 */
export function renderDashboardBiometricPresentation<
  O extends Owner, K extends keyof DashboardBiometricPresentationPorts[O] & string,
>(owner: O, kind: K, ports: DashboardBiometricPresentationPorts[O][K]): string {
  const ownerAnchors: Readonly<Record<string, NativeAnchor>> = dashboardBiometricPresentationAnchors[owner];
  const anchor = ownerAnchors[kind];
  if (!anchor) throw new Error('Unqualified Biometrics presentation branch');
  const callbacks = ports as Readonly<Record<string, NativePort>>;
  if (Object.keys(callbacks).length !== anchor.slots.length) {
    throw new Error('Unqualified Biometrics presentation ports');
  }
  const compiled = renderers[owner](kind);
  const frame = compiled === anchor.production.html ? anchor.production
    : compiled === anchor.development.html ? anchor.development : null;
  if (!frame) throw new Error('Unqualified complete Biometrics compiler frame');
  let skeleton = compiled.slice(frame.prefix.length, -frame.suffix.length);
  for (let i = frame.edits.length - 1; i >= 0; i--) {
    const edit = frame.edits[i]!;
    if (skeleton.slice(edit.start, edit.end) !== edit.before) {
      throw new Error('Unqualified fixed Biometrics source lexeme');
    }
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
  }
  if (skeleton !== anchor.nativeSkeleton) throw new Error('Unqualified native Biometrics skeleton');

  let cursor = 0;
  let output = '';
  for (const slot of anchor.slots) {
    const start = skeleton.indexOf(slot.coordinate, cursor);
    if (start < cursor || skeleton.indexOf(slot.coordinate, start + slot.coordinate.length) !== -1) {
      throw new Error('Unqualified private Biometrics coordinate');
    }
    const callback = callbacks[slot.port];
    if (typeof callback !== 'function') throw new Error('Unqualified named Biometrics port');
    // Native template interpolation uses the string hint and rejects Symbols.
    // In particular, repeated table headers/columns retain repeated coercion.
    const value = `${callback()}`;
    output += skeleton.slice(cursor, start) + value;
    cursor = start + slot.coordinate.length;
  }
  return output + skeleton.slice(cursor);
}
