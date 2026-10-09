import { upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { escapeAttr } from './utils.js';
import {renderHTML as renderCyclePicker} from './components/CycleImportPicker.svelte.html.js';
import {renderHTML as renderCycleCoverage} from './components/CycleImportCoverage.svelte.html.js';
import {projectCycleImportCoverage, type CycleImportCoverageView} from './cycle-import-presentation.js';

export const CYCLE_IMPORT_ACTION = 'data-cycle-import-action';
const SOURCE_LABELS: Record<string, string> = {
  apple_health: 'Apple Health',
  drip: 'Drip',
  clue: 'Clue',
  flo: 'Flo',
  natural_cycles: 'Natural Cycles',
  kindara: 'Kindara',
  ovuview: 'OvuView',
  femm: 'FEMM',
  fertility_friend: 'Fertility Friend',
  tempdrop: 'Tempdrop',
  manual: 'Manual',
};

export function cycleImportActionAttrs(action: string, data: Record<string, unknown> = {}) {
  const attrs = [`${CYCLE_IMPORT_ACTION}="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    const attrKey = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    if (value != null && value !== '') attrs.push(`data-cycle-import-${attrKey}="${escapeAttr(String(value))}"`);
  }
  return attrs.join(' ');
}

export function cycleImportSourceLabel(source: string) {
  return SOURCE_LABELS[source] || source;
}

export function renderCycleImportPicker() {
  return renderCyclePicker();
}

// The cold loader captures each label once; the loaded view reads it for each attribute.
export function getCycleImportSummaryView(mc: unknown, makeSourceLabel: (source: string) => () => string): CycleImportCoverageView | null {
  const upgraded = upgradeMenstrualCycleProfile(mc);
  const coverage = upgraded?.coverage;
  if (!coverage || (!coverage.periodCount && !coverage.observationCount && !Object.keys(coverage.sources || {}).length)) return null;
  const sourceRows = Object.entries(coverage.sources || {})
    .filter(([, info]) => (info?.periods || 0) > 0 || (info?.observations || 0) > 0)
    .map(([source, info]) => {
      const periodImportIds = (upgraded!.periods || []).filter(period => period.source === source && period.importId).map(period => period.importId);
      const importIds = Array.from(new Set([...(info.importIds || []), ...periodImportIds]));
      const batches = importIds.map((id, idx) => ({importId: id != null && id !== '' ? String(id) : undefined, label: `Remove batch ${idx + 1}`}));
      const readSourceLabel = makeSourceLabel(source);
      const label = readSourceLabel();
      const importedAt = info.importedAt ? String(info.importedAt).slice(0, 10) : null;
      const deleteTitle = source !== 'manual' ? `Remove ${readSourceLabel()}` : null;
      const deleteAriaLabel = source !== 'manual' ? `Remove ${readSourceLabel()} cycle data` : null;
      return {source, label, periodCount: info.periods || 0, observationCount: info.observations || 0, importedAt, batches, deleteTitle, deleteAriaLabel};
    });
  return projectCycleImportCoverage({
    periodCount: coverage.periodCount || 0, observationCount: coverage.observationCount || 0,
    firstDate: coverage.firstDate, lastDate: coverage.lastDate, sources: sourceRows,
  });
}

export function renderCycleImportSummary(mc: unknown, makeSourceLabel: (source: string) => () => string) {
  const view = getCycleImportSummaryView(mc, makeSourceLabel);
  return view ? renderCycleCoverage({view}) : '';
}
