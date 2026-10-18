import {renderHTML as renderCyclePicker} from './components/CycleImportPicker.svelte.html.js';
import {renderHTML as renderCycleCoverage} from './components/CycleImportCoverage.svelte.html.js';
import {getCycleImportSummaryView} from './cycle-import-summary.js';
export {CYCLE_IMPORT_ACTION, cycleImportActionAttrs, cycleImportSourceLabel, getCycleImportSummaryView} from './cycle-import-summary.js';

export function renderCycleImportPicker() {
  return renderCyclePicker();
}

export function renderCycleImportSummary(mc: unknown, makeSourceLabel: (source: string) => () => string) {
  const view = getCycleImportSummaryView(mc, makeSourceLabel);
  return view ? renderCycleCoverage({view}) : '';
}
