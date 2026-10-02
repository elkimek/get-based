import { upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { escapeAttr, escapeHTML } from './utils.js';

export const CYCLE_IMPORT_ACTION = 'data-cycle-import-action';
const CYCLE_IMPORT_ACCEPT = '.csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip';
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
  return `<button type="button" class="cycle-icon-btn" ${cycleImportActionAttrs('pick-file')} title="Import cycle data" aria-label="Import cycle data"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg></button>
    <input type="file" class="cycle-import-file-input" ${cycleImportActionAttrs('select-file')} accept="${CYCLE_IMPORT_ACCEPT}" hidden aria-label="Choose a cycle export">`;
}

// The cold loader captures each label once; the loaded view reads it for each attribute.
export function renderCycleImportSummary(mc: unknown, makeSourceLabel: (source: string) => () => string) {
  const upgraded = upgradeMenstrualCycleProfile(mc);
  const coverage = upgraded?.coverage;
  if (!coverage || (!coverage.periodCount && !coverage.observationCount && !Object.keys(coverage.sources || {}).length)) return '';
  const sourceRows = Object.entries(coverage.sources || {})
    .filter(([, info]) => (info?.periods || 0) > 0 || (info?.observations || 0) > 0)
    .map(([source, info]) => {
      const periodImportIds = (upgraded!.periods || []).filter(period => period.source === source && period.importId).map(period => period.importId);
      const importIds = Array.from(new Set([...(info.importIds || []), ...periodImportIds]));
      const batchButtons = importIds.map((id, idx) => `<button type="button" class="cycle-mini-action" ${cycleImportActionAttrs('delete-import', { importId: id })}>Remove batch ${idx + 1}</button>`).join('');
      const readSourceLabel = makeSourceLabel(source);
      return `<div class="cycle-source-row">
        <div class="cycle-source-main">
          <strong>${escapeHTML(readSourceLabel())}</strong>
          <span>${info.periods || 0} periods / ${info.observations || 0} local observations${info.importedAt ? ` / ${escapeHTML(String(info.importedAt).slice(0, 10))}` : ''}</span>
          ${batchButtons ? `<div class="cycle-import-batches">${batchButtons}</div>` : ''}
        </div>
        ${source !== 'manual' ? `<button type="button" class="cycle-icon-btn cycle-delete-btn" ${cycleImportActionAttrs('delete-source', { source })} title="Remove ${escapeAttr(readSourceLabel())}" aria-label="Remove ${escapeAttr(readSourceLabel())} cycle data">x</button>` : ''}
      </div>`;
    }).join('');
  return `<section class="cycle-editor-section cycle-import-summary-section">
    <div class="cycle-editor-section-title">Import Coverage</div>
    <div class="cycle-import-coverage">
      <span>${coverage.periodCount || 0} observed periods</span>
      <span>${coverage.observationCount || 0} local daily observations</span>
      ${coverage.firstDate || coverage.lastDate ? `<span>${escapeHTML(coverage.firstDate || '?')} - ${escapeHTML(coverage.lastDate || '?')}</span>` : ''}
    </div>
    ${sourceRows ? `<div class="cycle-source-list">${sourceRows}</div>` : ''}
  </section>`;
}
