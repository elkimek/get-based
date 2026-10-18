import { renderHTML as renderWearableMetricCard } from './WearableMetricCard.js';
import { renderHTML as renderWearableStripHeader } from './WearableStripHeader.js';
import { renderHTML as renderWearableStripBody } from './WearableStripBody.js';
import { wearableStripPresentationAnchors } from './wearable-strip-presentation-compiler-anchors.js';

type NativePort = () => unknown;
export interface WearableStripPresentationPorts {
  WearableMetricCard: {
    "subLabel": { escapedSubLabel: NativePort; };
    "unit": { tightUnitClass: NativePort; escapedUnit: NativePort; };
    "staleness": { latestDate: NativePort; formattedDate: NativePort; };
    "sourceBadge": { sourceActionAttributes: NativePort; sourceName: NativePort; };
    "card": { actionAttributes: NativePort; accessibleLabel: NativePort; label: NativePort; subLabel: NativePort; optionalDelta: NativePort; value: NativePort; unit: NativePort; baselineValue: NativePort; baselineUnit: NativePort; staleness: NativePort; sparkline: NativePort; trendClass: NativePort; trendLabel: NativePort; sourceBadge: NativePort; };
    "delta": { deltaClass: NativePort; deltaText: NativePort; };
  };
  WearableStripHeader: {
    "manualTitle": { };
    "sourceTitle": { sourceNames: NativePort; coverage: NativePort; };
    "lastSync": { lastSyncAge: NativePort; };
    "syncButton": { syncActionAttributes: NativePort; };
    "header": { toggleHeaderAttributes: NativePort; title: NativePort; optionalDemoPill: NativePort; optionalReorderHint: NativePort; lastSync: NativePort; syncButton: NativePort; reorderActiveClass: NativePort; reorderAccessibleLabel: NativePort; reorderTitle: NativePort; reorderActionAttributes: NativePort; reorderText: NativePort; collapseClass: NativePort; expanded: NativePort; collapseAccessibleLabel: NativePort; collapseActionAttributes: NativePort; gridHiddenClass: NativePort; gridReorderClass: NativePort; };
    "demoPill": { settingsActionAttributes: NativePort; };
    "reorderHint": { };
  };
  WearableStripBody: {
    "reorderCard": { metricAttribute: NativePort; card: NativePort; leftAccessibleLabel: NativePort; leftDisabled: NativePort; leftActionAttributes: NativePort; rightAccessibleLabel: NativePort; rightDisabled: NativePort; rightActionAttributes: NativePort; };
    "gridEnd": { };
    "footerStart": { hiddenClass: NativePort; };
    "waitingNote": { waitingNote: NativePort; };
    "hrvNote": { hrvNote: NativePort; };
    "footerEnd": { };
    "stripEnd": { };
  };
}

type Owner = keyof WearableStripPresentationPorts;
interface FixedEdit { readonly start: number; readonly end: number; readonly before: string; readonly after: string; }
interface CompilerFrame { readonly html: string; readonly prefix: string; readonly suffix: string; readonly edits: readonly FixedEdit[]; }
interface NativeAnchor {
  readonly slots: readonly { readonly coordinate: string; readonly port: string }[];
  readonly nativeSkeleton: string;
  readonly production: CompilerFrame;
  readonly development: CompilerFrame;
}
const renderers = {
  WearableMetricCard: (kind: string) => renderWearableMetricCard({ kind: kind as "subLabel" | "unit" | "staleness" | "sourceBadge" | "card" | "delta" }),
  WearableStripHeader: (kind: string) => renderWearableStripHeader({ kind: kind as "manualTitle" | "sourceTitle" | "lastSync" | "syncButton" | "header" | "demoPill" | "reorderHint" }),
  WearableStripBody: (kind: string) => renderWearableStripBody({ kind: kind as "reorderCard" | "gridEnd" | "footerStart" | "waitingNote" | "hrvNote" | "footerEnd" | "stripEnd" }),
};

/**
 * The Svelte owners supply complete native strip, card and SVG markup. Its exact compiler
 * frame is restored before named callbacks run once in native interpolation
 * order. Payloads are inserted once and never rescanned.
 */
export function renderWearableStripPresentation<
  O extends Owner, K extends keyof WearableStripPresentationPorts[O] & string,
>(owner: O, kind: K, ports: WearableStripPresentationPorts[O][K]): string {
  const ownerAnchors: Readonly<Record<string, NativeAnchor>> = wearableStripPresentationAnchors[owner];
  const anchor = ownerAnchors[kind];
  if (!anchor) throw new Error('Unqualified wearable strip presentation branch');
  const callbacks = ports as Readonly<Record<string, NativePort>>;
  if (Object.keys(callbacks).length !== anchor.slots.length) {
    throw new Error('Unqualified wearable strip presentation ports');
  }
  const compiled = renderers[owner](kind);
  const frame = compiled === anchor.production.html ? anchor.production
    : compiled === anchor.development.html ? anchor.development : null;
  if (!frame) throw new Error('Unqualified complete wearable strip compiler frame');
  let skeleton = compiled.slice(frame.prefix.length, -frame.suffix.length);
  for (let i = frame.edits.length - 1; i >= 0; i--) {
    const edit = frame.edits[i]!;
    if (skeleton.slice(edit.start, edit.end) !== edit.before) {
      throw new Error('Unqualified fixed wearable strip source lexeme');
    }
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
  }
  if (skeleton !== anchor.nativeSkeleton) throw new Error('Unqualified native wearable strip skeleton');

  let cursor = 0;
  let output = '';
  for (const slot of anchor.slots) {
    const start = skeleton.indexOf(slot.coordinate, cursor);
    if (start < cursor || skeleton.indexOf(slot.coordinate, start + slot.coordinate.length) !== -1) {
      throw new Error('Unqualified private wearable strip coordinate');
    }
    const callback = callbacks[slot.port];
    if (typeof callback !== 'function') throw new Error('Unqualified named wearable strip port');
    // Native template interpolation uses the string hint and rejects Symbols.
    const value = `${callback()}`;
    output += skeleton.slice(cursor, start) + value;
    cursor = start + slot.coordinate.length;
  }
  return output + skeleton.slice(cursor);
}
