import type {PlacementSummaryView} from './marker-placement-view.js';
/** Already captured native scalars and genuine children; no escaped markup. */
export type MarkerDetailActionName = 'revert-ref-range'|'edit-ref-range'|'clear-ref-edit-field'|'save-ref-range'|'revert-marker-name'|'rename-marker'|'quick-pin'|'close-modal'|'toggle-history-note'|'revert-marker-value'|'delete-marker-value'|'edit-marker-value'|'edit-value-note'|'delete-value-note'|'show-detail-modal'|'open-manual-entry'|'ask-ai'|'toggle-marker-note-editor'|'save-marker-note'|'delete-marker-note'|'delete-custom-marker';
export interface MarkerDetailActionFields {id?:unknown;date?:unknown;type?:unknown;field?:unknown;value?:unknown;dotKey?:unknown;showAllHistory?:unknown;historyLimit?:unknown;scrollToHistory?:unknown;}
export interface MarkerDetailActionView {readonly action:MarkerDetailActionName;readonly id:string|null;readonly date:string|null;readonly type:string|null;readonly field:string|null;readonly value:string|null;readonly dotKey:string|null;readonly showAllHistory:string|null;readonly historyLimit:string|null;readonly scrollToHistory:string|null;}
export interface AlternateRange {readonly label:'Reference'|'Optimal';readonly range:string;readonly optimal:boolean;}
export type MarkerDetailRangeView =
  | Readonly<{kind: "band"; lowZone: RangeLowZone | null; highZone: RangeHighZone | null; optimalZone: RangeOptimalZone | null; status: string; position: string; minimum: string; maximum: string}>
  | Readonly<{kind: "low-zone"; width: string}>
  | Readonly<{kind: "high-zone"; left: string; width: string}>
  | Readonly<{kind: "optimal-zone"; left: string; width: string}>
  | Readonly<{kind: "edited-badge"; label: string; title: string; actions: MarkerDetailActionView; text: string}>
  | Readonly<{kind: "edit-control"; optimalClass: string; label: string; currentRange: string; actions: MarkerDetailActionView; lowerLabel: string; badge: RangeEditedBadge | null; leadingSeparator?: boolean}>
  | Readonly<{kind: "suggestion"; href: string}>;

export type MarkerDetailHistoryView =
  | Readonly<{kind: "phase"; phase: string; minimum: string; maximum: string}>
  | Readonly<{kind: "date-note"; actions: MarkerDetailActionView; text: string}>
  | Readonly<{kind: "manual-revert"; actions: MarkerDetailActionView}>
  | Readonly<{kind: "manual-badge"}>
  | Readonly<{kind: "delete-value"; actions: MarkerDetailActionView}>
  | Readonly<{kind: "value-note"; editActions: MarkerDetailActionView; text: string; deleteActions: MarkerDetailActionView}>
  | Readonly<{kind: "add-note"; actions: MarkerDetailActionView}>
  | Readonly<{kind: "alternate-value"; value: string; unit: string}>
  | Readonly<{kind: "row"; status: string; deleteButton: HistoryDeleteValue; date: string; dateNote: HistoryDateNote | null; source: readonly HistorySource[]; valueStatus: string; editAttributes: MarkerDetailActionView | null; value: string; manualBadge: HistoryManualBadge | null; badgeStatus: string; statusLabel: string; alternate: HistoryAlternateValue | null; phase: HistoryPhase | null; collection: HistoryCollection | null; valueNote: HistoryValueNote | null}>
  | Readonly<{kind: "more"; actions: MarkerDetailActionView; label: string}>
  | Readonly<{kind: "last-values"; actions: MarkerDetailActionView; count: string}>
  | Readonly<{kind: "trend"; direction: string; change: string; unit: string; sign: string; percentage: string; firstDate: string; lastDate: string}>
  | Readonly<{kind: "collection-context"; text: string}>
  | Readonly<{kind: "source-file"; title: string; text: string}>
  | Readonly<{kind: "source-edited"}>
  | Readonly<{kind: "source-report"; manualLabel: string}>
  | Readonly<{kind: "source-manual"}>;

export type MarkerDetailEditorView =
  | Readonly<{kind: "reference"; label: string; minimum: string; clearMinimum: MarkerDetailActionView; maximum: string; clearMaximum: MarkerDetailActionView; saveActions: MarkerDetailActionView}>;

export type MarkerDetailChromeView =
  | Readonly<{kind: "renamed"; revertActions: MarkerDetailActionView; renameActions: MarkerDetailActionView}>
  | Readonly<{kind: "rename"; actions: MarkerDetailActionView}>
  | Readonly<{kind: "alternate-optimal"; range: string}>
  | Readonly<{kind: "alternate-unit"; unit: string; ranges: readonly AlternateRange[]}>
  | Readonly<{kind: "header"; placement: PlacementSummaryView; name: string; rename: ChromeRename; unit: string; alternate: ChromeAlternateUnit | null; pinClass: string; pinPressed: 'true' | 'false'; pinTitle: string; pinActions: MarkerDetailActionView; pinText: string; statusClass: string; status: string; closeActions: MarkerDetailActionView; latestStatus: string; latest: string; latestUnit: ChromeLatestUnit | null; latestDate: string; latestDelta: string; range: string; rangeLabel: string; secondary: ChromeSecondary | null; rangeControls: ChromeRangeControls | null; rangeBand: RangeBand | null}>
  | Readonly<{kind: "latest-unit"; unit: string}>
  | Readonly<{kind: "secondary-range"; label: string; range: string}>
  | Readonly<{kind: "latest-range"}>
  | Readonly<{kind: "range-controls"; controls: readonly RangeEditControl[]; suggestion: RangeSuggestion | null}>
  | Readonly<{kind: "primary-actions"; manualActions: MarkerDetailActionView; askActions: MarkerDetailActionView}>
  | Readonly<{kind: "recommendations"; id: string}>
  | Readonly<{kind: "delete-marker"; actions: MarkerDetailActionView}>
  | Readonly<{kind: "history"; rows: readonly HistoryRow[]}>
  | Readonly<{kind: "actions"; primary: ChromePrimary; notes: NotesEditor; recommendations: ChromeRecommendations | null}>;

export type MarkerDetailBioAgeView =
  | Readonly<{kind: "input"; state: string; title: string; glyph: '✓' | '⚠'; label: string}>
  | Readonly<{kind: "delta"; sign: string; years: string}>
  | Readonly<{kind: "present-heading"; name: string; value: string; delta: BioAgeDelta | null}>
  | Readonly<{kind: "missing-heading"; name: string; missing: string; total: string; noun: string}>
  | Readonly<{kind: "component"; state: string; heading: BioAgeHeading; inputs: readonly BioAgeInput[]}>
  | Readonly<{kind: "panel-date"; date: string}>
  | Readonly<{kind: "warning"; issues: string}>
  | Readonly<{kind: "breakdown"; date: BioAgeDate | null; warning: BioAgeWarning | null; pheno: BioAgeComponent; bortz: BioAgeComponent}>
  | Readonly<{kind: "missing"; issues: string}>;

export type MarkerDetailNotesView =
  | Readonly<{kind: "editor"; editActions: MarkerDetailActionView; editLabel: string; note: NotesText | null; text: string; saveActions: MarkerDetailActionView; cancelActions: MarkerDetailActionView; delete: NotesDelete | null}>
  | Readonly<{kind: "text"; text: string}>
  | Readonly<{kind: "delete"; actions: MarkerDetailActionView}>;


type Kind<T,K> = Extract<T,{kind:K}>;
export type RangeLowZone=Kind<MarkerDetailRangeView,'low-zone'>;
export type RangeHighZone=Kind<MarkerDetailRangeView,'high-zone'>;
export type RangeOptimalZone=Kind<MarkerDetailRangeView,'optimal-zone'>;
export type RangeBand=Kind<MarkerDetailRangeView,'band'>;
export type RangeEditedBadge=Kind<MarkerDetailRangeView,'edited-badge'>;
export type RangeEditControl=Kind<MarkerDetailRangeView,'edit-control'>;
export type RangeSuggestion=Kind<MarkerDetailRangeView,'suggestion'>;
export type HistoryDeleteValue=Kind<MarkerDetailHistoryView,'delete-value'>;
export type HistoryDateNote=Kind<MarkerDetailHistoryView,'date-note'>;
export type HistorySource=Kind<MarkerDetailHistoryView,'source-file'|'source-edited'|'source-report'|'source-manual'>;
export type HistoryManualBadge=Kind<MarkerDetailHistoryView,'manual-badge'|'manual-revert'>;
export type HistoryAlternateValue=Kind<MarkerDetailHistoryView,'alternate-value'>;
export type HistoryPhase=Kind<MarkerDetailHistoryView,'phase'>;
export type HistoryCollection=Kind<MarkerDetailHistoryView,'collection-context'>;
export type HistoryValueNote=Kind<MarkerDetailHistoryView,'value-note'|'add-note'>;
export type HistoryRow=Kind<MarkerDetailHistoryView,'row'>;
export type HistoryPaging=Kind<MarkerDetailHistoryView,'more'|'last-values'>;
export type HistoryTrend=Kind<MarkerDetailHistoryView,'trend'>;
export type ChromeRename=Kind<MarkerDetailChromeView,'rename'|'renamed'>;
export type ChromeAlternateUnit=Kind<MarkerDetailChromeView,'alternate-unit'>;
export type ChromeLatestUnit=Kind<MarkerDetailChromeView,'latest-unit'>;
export type ChromeSecondary=Kind<MarkerDetailChromeView,'secondary-range'|'latest-range'>;
export type ChromeRangeControls=Kind<MarkerDetailChromeView,'range-controls'>;
export type ChromeHeader=Kind<MarkerDetailChromeView,'header'>;
export type ChromePrimary=Kind<MarkerDetailChromeView,'primary-actions'>;
export type ChromeRecommendations=Kind<MarkerDetailChromeView,'recommendations'>;
export type ChromeActions=Kind<MarkerDetailChromeView,'actions'>;
export type ChromeDelete=Kind<MarkerDetailChromeView,'delete-marker'>;
export type BioAgeInput=Kind<MarkerDetailBioAgeView,'input'>;
export type BioAgeDelta=Kind<MarkerDetailBioAgeView,'delta'>;
export type BioAgeHeading=Kind<MarkerDetailBioAgeView,'present-heading'|'missing-heading'>;
export type BioAgeComponent=Kind<MarkerDetailBioAgeView,'component'>;
export type BioAgeDate=Kind<MarkerDetailBioAgeView,'panel-date'>;
export type BioAgeWarning=Kind<MarkerDetailBioAgeView,'warning'>;
export type BioAgeResult=Kind<MarkerDetailBioAgeView,'breakdown'|'missing'>;
export type NotesEditor=Kind<MarkerDetailNotesView,'editor'>;
export type NotesText=Kind<MarkerDetailNotesView,'text'>;
export type NotesDelete=Kind<MarkerDetailNotesView,'delete'>;
export interface MarkerDetailModalView {readonly header:ChromeHeader;readonly rows:readonly HistoryRow[];readonly paging:HistoryPaging|null;readonly trend:HistoryTrend|null;readonly bio:BioAgeResult|null;readonly actions:ChromeActions;readonly deleteMarker:ChromeDelete|null;}
