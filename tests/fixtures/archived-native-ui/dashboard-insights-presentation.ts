import { renderHTML as renderDashboardInsights } from './components/DashboardInsights.svelte.html.js';
import { dashboardInsightsPresentationAnchors } from './dashboard-insights-presentation-compiler-anchors.js';

type NativePort = () => unknown;
export interface DashboardInsightsPresentationPorts {
  renderDashboardInsightsListWidget: {
    "list": { itemsHTML: NativePort; };
    "card": { toneClass: NativePort; optionalDetailAttributes: NativePort; eyebrow: NativePort; title: NativePort; body: NativePort; };
  };
}

type Owner = keyof DashboardInsightsPresentationPorts;
interface FixedEdit { readonly start: number; readonly end: number; readonly before: string; readonly after: string; }
interface CompilerFrame { readonly html: string; readonly prefix: string; readonly suffix: string; readonly edits: readonly FixedEdit[]; }
interface NativeAnchor {
  readonly slots: readonly { readonly coordinate: string; readonly port: string }[];
  readonly nativeSkeleton: string;
  readonly production: CompilerFrame;
  readonly development: CompilerFrame;
}
const renderers = {
  renderDashboardInsightsListWidget: (kind: string) => renderDashboardInsights({ kind: kind as "list" | "card" }),
};

/**
 * The Svelte owner supplies complete list and card markup. Its exact compiler
 * frame is restored before named callbacks run once in native interpolation
 * order. Payloads are inserted once and never rescanned.
 */
export function renderDashboardInsightsPresentation<
  O extends Owner, K extends keyof DashboardInsightsPresentationPorts[O] & string,
>(owner: O, kind: K, ports: DashboardInsightsPresentationPorts[O][K]): string {
  const ownerAnchors: Readonly<Record<string, NativeAnchor>> = dashboardInsightsPresentationAnchors[owner];
  const anchor = ownerAnchors[kind];
  if (!anchor) throw new Error('Unqualified Dashboard Insights presentation branch');
  const callbacks = ports as Readonly<Record<string, NativePort>>;
  if (Object.keys(callbacks).length !== anchor.slots.length) {
    throw new Error('Unqualified Dashboard Insights presentation ports');
  }
  const compiled = renderers[owner](kind);
  const frame = compiled === anchor.production.html ? anchor.production
    : compiled === anchor.development.html ? anchor.development : null;
  if (!frame) throw new Error('Unqualified complete Dashboard Insights compiler frame');
  let skeleton = compiled.slice(frame.prefix.length, -frame.suffix.length);
  for (let i = frame.edits.length - 1; i >= 0; i--) {
    const edit = frame.edits[i]!;
    if (skeleton.slice(edit.start, edit.end) !== edit.before) {
      throw new Error('Unqualified fixed Dashboard Insights source lexeme');
    }
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
  }
  if (skeleton !== anchor.nativeSkeleton) throw new Error('Unqualified native Dashboard Insights skeleton');

  let cursor = 0;
  let output = '';
  for (const slot of anchor.slots) {
    const start = skeleton.indexOf(slot.coordinate, cursor);
    if (start < cursor || skeleton.indexOf(slot.coordinate, start + slot.coordinate.length) !== -1) {
      throw new Error('Unqualified private Dashboard Insights coordinate');
    }
    const callback = callbacks[slot.port];
    if (typeof callback !== 'function') throw new Error('Unqualified named Dashboard Insights port');
    // Native template interpolation uses the string hint and rejects Symbols.
    const value = `${callback()}`;
    output += skeleton.slice(cursor, start) + value;
    cursor = start + slot.coordinate.length;
  }
  return output + skeleton.slice(cursor);
}
