import {renderHTML as chromeHTML} from './components/MarkerDetailChrome.svelte.html.js';
import {renderHTML as bioHTML} from './components/MarkerDetailBioAge.svelte.html.js';
import {renderHTML as notesHTML} from './components/MarkerDetailNotes.svelte.html.js';
import {markerDetailCompleteCompilerAnchors, markerDetailCompleteCompilerAnchorPositions, markerDetailCompletePrivateSkeletons, markerDetailCompleteSerialization} from './marker-detail-complete-compiler.js';

export type MarkerDetailChromeView =
  | {kind: "renamed"; revertActions: string; renameActions: string}
  | {kind: "rename"; actions: string}
  | {kind: "alternate-optimal"; range: string}
  | {kind: "alternate-unit"; unit: string; ranges: string}
  | {kind: "header"; placement: string; name: string; rename: string; unit: string; alternate: string; pinClass: string; pinPressed: 'true' | 'false'; pinTitle: string; pinActions: string; pinText: string; statusClass: string; status: string; closeActions: string; latestStatus: string; latest: string; latestUnit: string; latestDate: string; latestDelta: string; range: string; rangeLabel: string; secondary: string; rangeControls: string; rangeBand: string}
  | {kind: "latest-unit"; unit: string}
  | {kind: "secondary-range"; label: string; range: string}
  | {kind: "latest-range"}
  | {kind: "range-controls"; controls: string; suggestion: string}
  | {kind: "primary-actions"; manualActions: string; askActions: string}
  | {kind: "recommendations"; id: string}
  | {kind: "delete-marker"; actions: string}
  | {kind: "history"; rows: string}
  | {kind: "actions"; primary: string; notes: string; recommendations: string};

export type MarkerDetailBioAgeView =
  | {kind: "input"; state: string; title: string; glyph: string; label: string}
  | {kind: "delta"; sign: string; years: string}
  | {kind: "present-heading"; name: string; value: string; delta: string}
  | {kind: "missing-heading"; name: string; missing: string; total: string; noun: string}
  | {kind: "component"; state: string; heading: string; inputs: string}
  | {kind: "panel-date"; date: string}
  | {kind: "warning"; issues: string}
  | {kind: "breakdown"; date: string; warning: string; pheno: string; bortz: string}
  | {kind: "missing"; issues: string};

export type MarkerDetailNotesView =
  | {kind: "editor"; editActions: string; editLabel: string; note: string; text: string; saveActions: string; cancelActions: string; delete: string}
  | {kind: "text"; text: string}
  | {kind: "delete"; actions: string};

const attributeSlots = {
  "renamed": [
    {
      "field": "revertActions",
      "attribute": "data-marker-detail-chrome-owned-revert-actions",
      "consumeSpace": false
    },
    {
      "field": "renameActions",
      "attribute": "data-marker-detail-chrome-owned-rename-actions",
      "consumeSpace": false
    }
  ],
  "rename": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-chrome-owned-actions",
      "consumeSpace": false
    }
  ],
  "alternate-optimal": [],
  "alternate-unit": [],
  "header": [
    {
      "field": "pinActions",
      "attribute": "data-marker-detail-chrome-owned-pin-actions",
      "consumeSpace": false
    },
    {
      "field": "closeActions",
      "attribute": "data-marker-detail-chrome-owned-close-actions",
      "consumeSpace": false
    }
  ],
  "latest-unit": [],
  "secondary-range": [],
  "latest-range": [],
  "range-controls": [],
  "input": [],
  "delta": [],
  "present-heading": [],
  "missing-heading": [],
  "component": [],
  "panel-date": [],
  "warning": [],
  "breakdown": [],
  "missing": [],
  "primary-actions": [
    {
      "field": "manualActions",
      "attribute": "data-marker-detail-chrome-owned-manual-actions",
      "consumeSpace": false
    },
    {
      "field": "askActions",
      "attribute": "data-marker-detail-chrome-owned-ask-actions",
      "consumeSpace": false
    }
  ],
  "editor": [
    {
      "field": "editActions",
      "attribute": "data-marker-detail-chrome-owned-edit-actions",
      "consumeSpace": false
    },
    {
      "field": "saveActions",
      "attribute": "data-marker-detail-chrome-owned-save-actions",
      "consumeSpace": false
    },
    {
      "field": "cancelActions",
      "attribute": "data-marker-detail-chrome-owned-cancel-actions",
      "consumeSpace": false
    }
  ],
  "text": [],
  "delete": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-chrome-owned-actions",
      "consumeSpace": false
    }
  ],
  "recommendations": [],
  "delete-marker": [
    {
      "field": "actions",
      "attribute": "data-marker-detail-chrome-owned-actions",
      "consumeSpace": false
    }
  ],
  "history": [],
  "actions": []
} as const;

const fieldOrder = {
  "renamed": [
    "revertActions",
    "renameActions"
  ],
  "rename": [
    "actions"
  ],
  "alternate-optimal": [
    "range"
  ],
  "alternate-unit": [
    "unit",
    "ranges"
  ],
  "header": [
    "placement",
    "name",
    "rename",
    "unit",
    "alternate",
    "pinClass",
    "pinPressed",
    "pinTitle",
    "pinActions",
    "pinText",
    "statusClass",
    "status",
    "closeActions",
    "latestStatus",
    "latest",
    "latestUnit",
    "latestDate",
    "latestDelta",
    "range",
    "rangeLabel",
    "secondary",
    "rangeControls",
    "rangeBand"
  ],
  "latest-unit": [
    "unit"
  ],
  "secondary-range": [
    "label",
    "range"
  ],
  "latest-range": [],
  "range-controls": [
    "controls",
    "suggestion"
  ],
  "input": [
    "state",
    "title",
    "glyph",
    "label"
  ],
  "delta": [
    "sign",
    "years"
  ],
  "present-heading": [
    "name",
    "value",
    "delta"
  ],
  "missing-heading": [
    "name",
    "missing",
    "total",
    "noun"
  ],
  "component": [
    "state",
    "heading",
    "inputs"
  ],
  "panel-date": [
    "date"
  ],
  "warning": [
    "issues"
  ],
  "breakdown": [
    "date",
    "warning",
    "pheno",
    "bortz"
  ],
  "missing": [
    "issues"
  ],
  "primary-actions": [
    "manualActions",
    "askActions"
  ],
  "editor": [
    "editActions",
    "editLabel",
    "note",
    "text",
    "saveActions",
    "cancelActions",
    "delete"
  ],
  "text": [
    "text"
  ],
  "delete": [
    "actions"
  ],
  "recommendations": [
    "id"
  ],
  "delete-marker": [
    "actions"
  ],
  "history": [
    "rows"
  ],
  "actions": [
    "primary",
    "notes",
    "recommendations"
  ]
} as const;

type MarkerDetailCompleteView = MarkerDetailChromeView | MarkerDetailBioAgeView | MarkerDetailNotesView;
function stitch(view: MarkerDetailCompleteView, render: (view: MarkerDetailCompleteView) => string): string {
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
  const slots = entries.map(([name, value], index) => ({name, value, token: 'getbased-marker-detail-complete-owned-slot-' + index + '-end'}));
  const privateView = Object.fromEntries([['kind', view.kind], ...slots.map(slot => [slot.name, slot.token])]);
  const raw = render(privateView as MarkerDetailCompleteView);
  const comments = [...raw.matchAll(/<!--([\s\S]*?)-->/g)];
  const expected = markerDetailCompleteCompilerAnchors[view.kind];
  const positions = markerDetailCompleteCompilerAnchorPositions[view.kind];
  const serialization = markerDetailCompleteSerialization[view.kind];
  if (!expected || !positions || !serialization) throw new Error('Unqualified Marker Detail branch');
  if (comments.length !== expected.length || comments.some((comment, index) => comment[1] !== expected[index] || comment.index !== positions[index])) {
    throw new Error('Unqualified Marker Detail compiler anchors');
  }
  let skeleton = raw;
  for (const comment of [...comments].reverse()) {
    skeleton = skeleton.slice(0, comment.index) + skeleton.slice(comment.index + comment[0].length);
  }
  if (skeleton !== markerDetailCompletePrivateSkeletons[view.kind]) {
    throw new Error('Unqualified Marker Detail private skeleton');
  }
  // Restore only the native owner's static entity/void-tag lexemes before data insertion.
  // The complete skeleton gate above forbids changed attributes, content, or coordinates.
  for (const edit of serialization.slice().reverse()) {
    if (skeleton.slice(edit.start, edit.end) !== edit.before) throw new Error('Unqualified Marker Detail fixed serialization');
    skeleton = skeleton.slice(0, edit.start) + edit.after + skeleton.slice(edit.end);
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


export function renderMarkerDetailChrome(view: MarkerDetailChromeView): string {
  return stitch(view, privateView => chromeHTML({view: privateView as MarkerDetailChromeView}));
}

export function renderMarkerDetailBioAge(view: MarkerDetailBioAgeView): string {
  return stitch(view, privateView => bioHTML({view: privateView as MarkerDetailBioAgeView}));
}

export function renderMarkerDetailNotes(view: MarkerDetailNotesView): string {
  return stitch(view, privateView => notesHTML({view: privateView as MarkerDetailNotesView}));
}
