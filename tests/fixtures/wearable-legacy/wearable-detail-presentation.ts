import { renderHTML as renderWearableManualEntries } from './WearableManualEntries.js';
import { renderHTML as renderWearableDetailChrome } from './WearableDetailChrome.js';
import { renderHTML as renderWearableDetailStats } from './WearableDetailStats.js';
import { renderHTML as renderWearableDetailFeedback } from './WearableDetailFeedback.js';
import { wearableDetailPresentationAnchors } from './wearable-detail-presentation-compiler-anchors.js';

type NativePort = () => unknown;
export interface WearableDetailPresentationPorts {
  WearableManualEntries: {
    "compactEmpty": { addActionAttributes: NativePort; };
    "empty": { addActionAttributes: NativePort; };
    "tags": { tagItems: NativePort; };
    "tag": { tag: NativePort; };
    "note": { note: NativePort; };
    "row": { noteClass: NativePort; dateAttribute: NativePort; shortDate: NativePort; value: NativePort; optionalUnit: NativePort; tags: NativePort; accessibleDeleteLabel: NativePort; deleteActionAttributes: NativePort; note: NativePort; };
    "unit": { unit: NativePort; };
    "list": { entryCount: NativePort; addActionAttributes: NativePort; rows: NativePort; };
  };
  WearableDetailChrome: {
    "subLabel": { subLabel: NativePort; };
    "pairedSourceSwap": { systolicActionAttributes: NativePort; systolicSource: NativePort; diastolicActionAttributes: NativePort; diastolicSource: NativePort; };
    "sourceSwap": { sourceActionAttributes: NativePort; sourceName: NativePort; };
    "rangePill": { activeClass: NativePort; pressed: NativePort; rangeActionAttributes: NativePort; label: NativePort; };
    "modal": { closeActionAttributes: NativePort; label: NativePort; subLabel: NativePort; sourceName: NativePort; optionalDelta: NativePort; trend: NativePort; sourceSwap: NativePort; rangePills: NativePort; emptyHint: NativePort; stats: NativePort; manualEntries: NativePort; emfHint: NativePort; };
  };
  WearableDetailStats: {
    "stat": { optionalTooltipAttributes: NativePort; label: NativePort; value: NativePort; optionalSubLabel: NativePort; };
    "subLabel": { subLabel: NativePort; };
  };
  WearableDetailFeedback: {
    "zeroActivity": { };
    "emptyChartWithManual": { emptyWindow: NativePort; olderManualHint: NativePort; };
    "emptyChart": { emptyWindow: NativePort; };
    "emfHint": { assessmentActionAttributes: NativePort; };
  };
}

type Owner = keyof WearableDetailPresentationPorts;
interface FixedEdit { readonly start: number; readonly end: number; readonly before: string; readonly after: string; }
interface CompilerFrame { readonly html: string; readonly prefix: string; readonly suffix: string; readonly edits: readonly FixedEdit[]; }
interface NativeAnchor {
  readonly slots: readonly { readonly coordinate: string; readonly port: string }[];
  readonly nativeSkeleton: string;
  readonly production: CompilerFrame;
  readonly development: CompilerFrame;
}
const renderers = {
  WearableManualEntries: (kind: string) => renderWearableManualEntries({ kind: kind as "compactEmpty" | "empty" | "tags" | "tag" | "note" | "row" | "unit" | "list" }),
  WearableDetailChrome: (kind: string) => renderWearableDetailChrome({ kind: kind as "subLabel" | "pairedSourceSwap" | "sourceSwap" | "rangePill" | "modal" }),
  WearableDetailStats: (kind: string) => renderWearableDetailStats({ kind: kind as "stat" | "subLabel" }),
  WearableDetailFeedback: (kind: string) => renderWearableDetailFeedback({ kind: kind as "zeroActivity" | "emptyChartWithManual" | "emptyChart" | "emfHint" }),
};

/**
 * The Svelte owners supply complete native strip, card and SVG markup. Its exact compiler
 * frame is restored before named callbacks run once in native interpolation
 * order. Payloads are inserted once and never rescanned.
 */
export function renderWearableDetailPresentation<
  O extends Owner, K extends keyof WearableDetailPresentationPorts[O] & string,
>(owner: O, kind: K, ports: WearableDetailPresentationPorts[O][K]): string {
  const ownerAnchors: Readonly<Record<string, NativeAnchor>> = wearableDetailPresentationAnchors[owner];
  const anchor = ownerAnchors[kind];
  if (!anchor) throw new Error('Unqualified wearable detail presentation branch');
  const callbacks = ports as Readonly<Record<string, NativePort>>;
  if (Object.keys(callbacks).length !== anchor.slots.length) {
    throw new Error('Unqualified wearable detail presentation ports');
  }
  const compiled = renderers[owner](kind);
  const frame = compiled === anchor.production.html ? anchor.production
    : compiled === anchor.development.html ? anchor.development : null;
  if (!frame) throw new Error('Unqualified complete wearable detail compiler frame');
  let skeleton = compiled.slice(frame.prefix.length, -frame.suffix.length);
  for (let i = frame.edits.length - 1; i >= 0; i--) {
    const edit = frame.edits[i]!;
    if (skeleton.slice(edit.start, edit.end) !== edit.before) {
      throw new Error('Unqualified fixed wearable detail source lexeme');
    }
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
  }
  if (skeleton !== anchor.nativeSkeleton) throw new Error('Unqualified native wearable detail skeleton');

  let cursor = 0;
  let output = '';
  for (const slot of anchor.slots) {
    const start = skeleton.indexOf(slot.coordinate, cursor);
    if (start < cursor || skeleton.indexOf(slot.coordinate, start + slot.coordinate.length) !== -1) {
      throw new Error('Unqualified private wearable detail coordinate');
    }
    const callback = callbacks[slot.port];
    if (typeof callback !== 'function') throw new Error('Unqualified named wearable detail port');
    // Native template interpolation uses the string hint and rejects Symbols.
    const value = `${callback()}`;
    output += skeleton.slice(cursor, start) + value;
    cursor = start + slot.coordinate.length;
  }
  return output + skeleton.slice(cursor);
}
