import {renderHTML as historyHTML} from './components/MarkerDetailHistory.svelte.html.js';
import {renderHTML as rangeHTML} from './components/MarkerDetailRange.svelte.html.js';
import {renderHTML as editorHTML} from './components/MarkerReferenceEditor.svelte.html.js';
import {markerDetailCompilerAnchors, markerDetailCompilerAnchorPositions, markerDetailPrivateSkeletons} from './marker-detail-compiler-anchors.js';

export type MarkerDetailRangeView =
  | {kind: "band"; lowZone: string; highZone: string; optimalZone: string; status: string; position: string; minimum: string; maximum: string}
  | {kind: "low-zone"; width: string}
  | {kind: "high-zone"; left: string; width: string}
  | {kind: "optimal-zone"; left: string; width: string}
  | {kind: "edited-badge"; label: string; title: string; actions: string; text: string}
  | {kind: "edit-control"; optimalClass: string; label: string; currentRange: string; actions: string; lowerLabel: string; badge: string}
  | {kind: "suggestion"; href: string};

export type MarkerDetailHistoryView =
  | {kind: "phase"; phase: string; minimum: string; maximum: string}
  | {kind: "date-note"; actions: string; text: string}
  | {kind: "manual-revert"; actions: string}
  | {kind: "manual-badge"}
  | {kind: "delete-value"; actions: string}
  | {kind: "value-note"; editActions: string; text: string; deleteActions: string}
  | {kind: "add-note"; actions: string}
  | {kind: "alternate-value"; value: string; unit: string}
  | {kind: "row"; status: string; deleteButton: string; date: string; dateNote: string; source: string; valueStatus: string; editAttributes: string; value: string; manualBadge: string; badgeStatus: string; statusLabel: string; alternate: string; phase: string; collection: string; valueNote: string}
  | {kind: "more"; actions: string; label: string}
  | {kind: "last-values"; actions: string; count: string}
  | {kind: "trend"; direction: string; change: string; unit: string; sign: string; percentage: string; firstDate: string; lastDate: string}
  | {kind: "collection-context"; text: string}
  | {kind: "source-file"; title: string; text: string}
  | {kind: "source-edited"}
  | {kind: "source-report"; manualLabel: string}
  | {kind: "source-manual"};

export type MarkerDetailEditorView =
  | {kind: "reference"; label: string; minimum: string; clearMinimum: string; maximum: string; clearMaximum: string; saveActions: string};

const attributeSlots = {
  "band": [],
  "low-zone": [],
  "high-zone": [],
  "optimal-zone": [],
  "edited-badge": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "edit-control": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "suggestion": [],
  "phase": [],
  "date-note": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "manual-revert": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "manual-badge": [],
  "delete-value": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "value-note": [
    {
      "field": "editActions",
      "attribute": "data-marker-detail-owned-edit-actions",
      "consumeSpace": false
    },
    {
      "field": "deleteActions",
      "attribute": "data-marker-detail-owned-delete-actions",
      "consumeSpace": false
    }
  ],
  "add-note": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "alternate-value": [],
  "row": [
    {
      "field": "editAttributes",
      "attribute": "data-marker-detail-owned-edit-attributes",
      "consumeSpace": true
    }
  ],
  "more": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "last-values": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-owned-actions",
      "consumeSpace": false
    }
  ],
  "trend": [],
  "collection-context": [],
  "source-file": [],
  "source-edited": [],
  "source-report": [],
  "source-manual": [],
  "reference": [
    {
      "field": "clearMinimum",
      "attribute": "data-marker-detail-owned-clear-minimum",
      "consumeSpace": false
    },
    {
      "field": "clearMaximum",
      "attribute": "data-marker-detail-owned-clear-maximum",
      "consumeSpace": false
    },
    {
      "field": "saveActions",
      "attribute": "data-marker-detail-owned-save-actions",
      "consumeSpace": false
    }
  ]
} as const;

const fieldOrder = {
  "band": [
    "lowZone",
    "highZone",
    "optimalZone",
    "status",
    "position",
    "minimum",
    "maximum"
  ],
  "low-zone": [
    "width"
  ],
  "high-zone": [
    "left",
    "width"
  ],
  "optimal-zone": [
    "left",
    "width"
  ],
  "edited-badge": [
    "label",
    "title",
    "actions",
    "text"
  ],
  "edit-control": [
    "optimalClass",
    "label",
    "currentRange",
    "actions",
    "lowerLabel",
    "badge"
  ],
  "suggestion": [
    "href"
  ],
  "phase": [
    "phase",
    "minimum",
    "maximum"
  ],
  "date-note": [
    "actions",
    "text"
  ],
  "manual-revert": [
    "actions"
  ],
  "manual-badge": [],
  "delete-value": [
    "actions"
  ],
  "value-note": [
    "editActions",
    "text",
    "deleteActions"
  ],
  "add-note": [
    "actions"
  ],
  "alternate-value": [
    "value",
    "unit"
  ],
  "row": [
    "status",
    "deleteButton",
    "date",
    "dateNote",
    "source",
    "valueStatus",
    "editAttributes",
    "value",
    "manualBadge",
    "badgeStatus",
    "statusLabel",
    "alternate",
    "phase",
    "collection",
    "valueNote"
  ],
  "more": [
    "actions",
    "label"
  ],
  "last-values": [
    "actions",
    "count"
  ],
  "trend": [
    "direction",
    "change",
    "unit",
    "sign",
    "percentage",
    "firstDate",
    "lastDate"
  ],
  "collection-context": [
    "text"
  ],
  "source-file": [
    "title",
    "text"
  ],
  "source-edited": [],
  "source-report": [
    "manualLabel"
  ],
  "source-manual": [],
  "reference": [
    "label",
    "minimum",
    "clearMinimum",
    "maximum",
    "clearMaximum",
    "saveActions"
  ]
} as const;

type MarkerDetailView = MarkerDetailHistoryView | MarkerDetailRangeView | MarkerDetailEditorView;
function stitch(view: MarkerDetailView, render: (view: MarkerDetailView) => string): string {
  const fields = fieldOrder[view.kind];
  const keys = Object.keys(view);
  if (keys.length !== fields.length + 1 || keys.some(key => key !== 'kind' && !fields.some(field => field === key))) {
    throw new Error('Unqualified Marker Detail projected fields');
  }
  const entries = fields.map(name => {
    const value: unknown = Reflect.get(view, name);
    if (typeof value !== 'string') throw new Error('Unqualified Marker Detail projected value');
    return [name, value] as const;
  });
  const slots = entries.map(([name, value], index) => ({name, value, token: 'getbased-marker-detail-owned-slot-' + index + '-end'}));
  const privateView = Object.fromEntries([['kind', view.kind], ...slots.map(slot => [slot.name, slot.token])]);
  const raw = render(privateView as MarkerDetailView);
  const comments = [...raw.matchAll(/<!--([\s\S]*?)-->/g)];
  const expected = markerDetailCompilerAnchors[view.kind];
  if (!expected) throw new Error('Unqualified Marker Detail branch');
  if (comments.length !== expected.length || comments.some((comment, index) => comment[1] !== expected[index] || comment.index !== markerDetailCompilerAnchorPositions[view.kind][index])) {
    throw new Error('Unqualified Marker Detail compiler anchors');
  }
  let skeleton = raw;
  for (const comment of [...comments].reverse()) {
    skeleton = skeleton.slice(0, comment.index) + skeleton.slice(comment.index + comment[0].length);
  }
  if (skeleton !== markerDetailPrivateSkeletons[view.kind]) {
    throw new Error('Unqualified Marker Detail private skeleton');
  }
  // Restore only the native owner's static entity/void-tag lexemes before data insertion.
  // The complete skeleton gate above forbids changed attributes, content, or coordinates.
  if (view.kind === 'edit-control') skeleton = skeleton.replace(' · <button', ' &middot; <button');
  if (view.kind === 'delete-value' || view.kind === 'value-note') {
    skeleton = skeleton.replace('>×</button>', '>&times;</button>');
  }
  if (view.kind === 'reference') {
    skeleton = skeleton.replace('id="ref-edit-min"/>', 'id="ref-edit-min">')
      .replace('id="ref-edit-max"/>', 'id="ref-edit-max">');
  }
  const edits: {start: number; end: number; value: string}[] = [];
  for (const slot of slots) {
    const attribute = attributeSlots[view.kind].find(candidate => candidate.field === slot.name);
    const needle = attribute
      ? (attribute.consumeSpace ? ' ' : '') + attribute.attribute + '="' + slot.token + '"'
      : slot.token;
    const start = skeleton.indexOf(needle);
    if (start < 0 || skeleton.indexOf(needle, start + 1) !== -1) {
      throw new Error('Unqualified Marker Detail owned slot');
    }
    edits.push({start, end: start + needle.length, value: slot.value});
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    skeleton = skeleton.slice(0, edit.start) + edit.value + skeleton.slice(edit.end);
  }
  return skeleton;
}

export function renderMarkerDetailHistory(view: MarkerDetailHistoryView): string {
  return stitch(view, privateView => historyHTML({view: privateView as MarkerDetailHistoryView}));
}
export function renderMarkerDetailRange(view: MarkerDetailRangeView): string {
  return stitch(view, privateView => rangeHTML({view: privateView as MarkerDetailRangeView}));
}
export function renderMarkerDetailEditor(view: MarkerDetailEditorView): string {
  return stitch(view, privateView => editorHTML({view: privateView as MarkerDetailEditorView}));
}
