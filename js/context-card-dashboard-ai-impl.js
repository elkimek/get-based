// @ts-check
// context-card-dashboard-ai-impl.js - lazy AI context modal and DNA picker implementation

import { getFolderBackupState, pickFolderForBackup } from './backup.js';
import { getEncryptionEnabled, showEnableEncryptionModal } from './crypto.js';
import { getActiveData, saveImportedData } from './data.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import {
  isGeneticsPriorityInAIContext,
  isGeneticsSummaryInAIContext,
  isGeneticsInventoryInAIContext,
  isGroupInAIContext,
  isInsightContextCardsEnabled,
  isLabMarkersContextEnabled,
  isLightSunContextEnabled,
  isSupplementsMedsContextEnabled,
  isWearableContextEnabled,
  isNutritionContextEnabled,
  getNutritionContextDays,
  NUTRITION_CONTEXT_DAY_OPTIONS,
  setGeneticsPriorityInAIContext,
  setGeneticsSummaryInAIContext,
  setGeneticsInventoryInAIContext,
  setGroupInAIContext,
  setInsightContextCardsEnabled,
  setLabMarkersContextEnabled,
  setLightSunContextEnabled,
  setSupplementsMedsContextEnabled,
  setWearableContextEnabled,
  setNutritionContextEnabled,
  setNutritionContextDays,
} from './lab-context.js';
import { getLensSummary, openKnowledgeBaseModal } from './lens.js';
import { state } from './state.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { isSyncEnabled } from './sync.js';
import { showSyncSetupModal } from './settings-sync-panel.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { migrateStoredContextSourceSettingsToProfile } from './context-source-registry.js';
import { openInterpretiveLensEditorRuntime } from './context-cards-runtime.js';
import { notifyDashboardAIContextStatusChanged } from './context-card-dashboard-ai-runtime.js';

let dashboardAISyncSetupHandler = showSyncSetupModal;
const dashboardAIDataProtectionDeps = { pickFolderForBackup, showEnableEncryptionModal };
export function configureDashboardAISyncSetup(handler = showSyncSetupModal) {
  dashboardAISyncSetupHandler = typeof handler === 'function' ? handler : showSyncSetupModal;
}

export function configureDashboardAIDataProtectionDeps(deps = {}) {
  const previous = { ...dashboardAIDataProtectionDeps };
  if (typeof deps.pickFolderForBackup === 'function') dashboardAIDataProtectionDeps.pickFolderForBackup = deps.pickFolderForBackup;
  if (typeof deps.showEnableEncryptionModal === 'function') dashboardAIDataProtectionDeps.showEnableEncryptionModal = deps.showEnableEncryptionModal;
  return previous;
}

// Programmatic DNA file picker. Mirrors the chat onboarding hidden-file-input
// pattern so the same handleDNAFile parser runs.
export function triggerDNAFilePicker() {
  let input = /** @type {HTMLInputElement | null} */ (document.getElementById('dna-dashboard-input'));
  if (!input) {
    const newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.id = 'dna-dashboard-input';
    newInput.accept = '.txt,.csv';
    newInput.style.display = 'none';
    newInput.addEventListener('change', () => {
      const f = newInput.files && newInput.files[0];
      if (f) getDnaModuleFunction('handleDNAFile')?.(f);
      newInput.value = '';
    });
    document.body.appendChild(newInput);
    input = newInput;
  }
  input.click();
}

function getDataProtectionStatus() {
  let backupConfigured = false;
  let backupSupported = true;
  try {
    const s = getFolderBackupState();
    backupSupported = !!s?.supported;
    backupConfigured = !!s?.folderName;
  } catch { /* backup not initialised yet */ }
  return {
    encryption: !!getEncryptionEnabled(),
    sync: !!isSyncEnabled(),
    backup: backupConfigured,
    backupSupported,
  };
}

function hasGenomeSnpData() {
  const snps = state.importedData?.genetics?.snps || {};
  return Object.keys(snps).length > 0;
}

function hasGenomeSummaryData() {
  const genetics = state.importedData?.genetics || {};
  return !!(genetics.apoe || genetics.mtdna);
}

/**
 * @typedef {{
 *   name: string,
 *   count: number,
 *   products: string[],
 *   sections: string[],
 * }} LabSourceGroup
 */

/**
 * @typedef {{
 *   coreMarkers: number,
 *   totalMarkers: number,
 *   groups: LabSourceGroup[],
 * }} LabSourceStats
 */

/** @returns {LabSourceStats} */
function getLabSourceStats() {
  /** @type {LabSourceStats} */
  const stats = { coreMarkers: 0, totalMarkers: 0, groups: [] };
  try {
    const data = getActiveData();
    /** @type {Map<string, { name: string, count: number, products: Set<string>, sections: Set<string> }>} */
    const groups = new Map();
    const imported = /** @type {any} */ (state.importedData || {});
    const snapshotsById = new Map((imported.importSnapshots || []).filter(s => s?.id).map(s => [s.id, s]));
    const sourceProductLabel = (dotKey) => {
      const labels = new Set();
      for (const entry of imported.entries || []) {
        const source = entry?.markerSources?.[dotKey];
        if (!source?.snapshotId) continue;
        const snapshot = snapshotsById.get(source.snapshotId);
        const label = getImportSnapshotProductLabel(snapshot, dotKey);
        if (label) labels.add(label);
      }
      return [...labels];
    };
    for (const [catKey, cat] of Object.entries(data.categories || {})) {
      const markers = Object.entries(cat.markers || {}).filter(([, m]) => Array.isArray(m.values) && m.values.some(v => v !== null));
      if (markers.length === 0) continue;
      stats.totalMarkers += markers.length;
      if (cat.group) {
        const row = groups.get(cat.group) || { name: cat.group, count: 0, products: new Set(), sections: new Set() };
        row.count += markers.length;
        if (cat.label) row.sections.add(cat.label);
        for (const [markerKey, marker] of markers) {
          const dotKey = getMarkerStorageDotKey(marker, `${catKey}_${markerKey}`);
          if (!dotKey) continue;
          for (const label of sourceProductLabel(dotKey)) row.products.add(label);
          const cm = imported.customMarkers?.[dotKey];
          const categoryLabel = cm?.categoryLabel;
          if (cat.group === 'Fatty Acids' && categoryLabel && !/^fatty acids$/i.test(categoryLabel)) {
            row.products.add(categoryLabel);
          }
        }
        groups.set(cat.group, row);
      } else {
        stats.coreMarkers += markers.length;
      }
    }
    stats.groups = [...groups.entries()]
      .map(([, row]) => ({
        name: row.name,
        count: row.count,
        products: [...row.products].sort((a, b) => a.localeCompare(b)),
        sections: [...row.sections].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { /* active data can be unavailable during early startup tests */ }
  return stats;
}

function getImportSnapshotProductLabel(snapshot, dotKey) {
  if (!snapshot) return null;
  const marker = Array.isArray(snapshot.markers)
    ? snapshot.markers.find(m => (m?.mappedKey || m?.suggestedKey) === dotKey)
    : null;
  const markerProduct = marker?.suggestedCategoryLabel;
  if (markerProduct && !/^fatty acids$/i.test(markerProduct)) return String(markerProduct);
  const testType = String(snapshot.testType || '').trim();
  if (!testType || /^blood$/i.test(testType)) return markerProduct || null;
  if (/^fattyacids$/i.test(testType)) return markerProduct || 'Fatty Acids';
  if (/^biostarks$/i.test(testType)) return 'BioStarks';
  return testType;
}

/** @param {LabSourceGroup} group */
function getLabGroupTitle(group) {
  const products = group.products || [];
  if (products.length === 1 && products[0] !== group.name) return `${products[0]} · ${group.name}`;
  return group.name;
}

/** @param {LabSourceGroup} group */
function getLabGroupDescription(group) {
  const markerCount = `${group.count} marker${group.count !== 1 ? 's' : ''}`;
  const products = group.products || [];
  if (products.length > 1) return `${markerCount} from ${products.join(', ')}.`;
  if (products.length === 1 && products[0] !== group.name) return `${markerCount} from this imported ${products[0]} section.`;
  const sections = (group.sections || []).filter(label => label && label !== group.name).slice(0, 3);
  if (sections.length > 0) return `${markerCount} across ${sections.join(', ')}.`;
  return `${markerCount} from this specialty group.`;
}

function hasLightSunData() {
  const imported = /** @type {any} */ (state.importedData || {});
  const env = imported.lightEnvironment;
  const hasEnv = (env && Array.isArray(env.rooms) && env.rooms.length > 0)
    || (env && Array.isArray(env.screens) && env.screens.length > 0)
    || (Array.isArray(imported.lightAudits) && imported.lightAudits.length > 0);
  return !!(
    (Array.isArray(imported.sunSessions) && imported.sunSessions.length > 0)
    || (Array.isArray(imported.deviceSessions) && imported.deviceSessions.length > 0)
    || (Array.isArray(imported.lightMeasurements) && imported.lightMeasurements.length > 0)
    || hasEnv
    || imported.sunDefaults?.completedAt
    || imported.lightCircadian
  );
}

function hasWearableContextData() {
  const imported = /** @type {any} */ (state.importedData || {});
  return !!(
    imported.wearableSummary
    || (imported.wearableConnections && Object.keys(imported.wearableConnections).length > 0)
    || (Array.isArray(imported.wearableEvents) && imported.wearableEvents.length > 0)
  );
}

function hasNutritionContextData() {
  return Number(state.nutritionSummary?.totalMeals || 0) > 0;
}

function hasMeaningfulContextValue(value) {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulContextValue);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulContextValue);
  return false;
}

function hasInsightContextData() {
  const imported = /** @type {any} */ (state.importedData || {});
  return [
    'healthGoals',
    'diagnoses',
    'biometrics',
    'menstrualCycle',
    'diet',
    'exercise',
    'sleepRest',
    'stress',
    'loveLife',
    'environment',
    'emfAssessment',
    'notes',
    'contextNotes',
    'changeHistory',
  ].some(key => hasMeaningfulContextValue(imported[key]));
}

function hasSupplementsMedsData() {
  const imported = /** @type {any} */ (state.importedData || {});
  return hasMeaningfulContextValue(imported.supplements);
}

/**
 * @param {{
 *   key: string,
 *   toggleKey?: string,
 *   title: string,
 *   description: string,
 *   status: string,
 *   checked: boolean,
 *   disabled?: boolean,
 *   attrs?: Record<string, unknown>,
 *   child?: boolean,
 *   affects?: string[],
 *   controlHtml?: string,
 * }} options
 */
function renderContextSourceToggle({ key, toggleKey = key, title, description, status, checked, disabled = false, attrs = {}, child = false, affects = [], controlHtml = '' }) {
  const id = `context-source-${key}`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const statusId = `${id}-status`;
  const extraAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` data-context-${escapeAttr(name)}="${escapeAttr(String(value))}"`)
    .join('');
  const affectsHtml = affects.length
    ? `<span class="context-source-affects">${affects.map(label => `<span class="context-affect-chip">${escapeHTML(label)}</span>`).join('')}</span>`
    : '';
  return `<div class="context-source-row${checked ? ' active' : ''}${disabled ? ' disabled' : ''}${child ? ' child' : ''}" data-context-source="${escapeAttr(key)}"${extraAttrs}>
    <div class="context-source-copy">
      <span class="context-source-title" id="${escapeAttr(titleId)}">${escapeHTML(title)}</span>
      <span class="context-source-desc" id="${escapeAttr(descriptionId)}">${escapeHTML(description)}</span>
      ${affectsHtml}
      <span class="context-source-status" id="${escapeAttr(statusId)}">${escapeHTML(status)}</span>
      ${controlHtml}
    </div>
    <label class="toggle-switch" for="${escapeAttr(id)}">
      <input type="checkbox" id="${escapeAttr(id)}" data-context-toggle="${escapeAttr(toggleKey)}" aria-labelledby="${escapeAttr(titleId)}" aria-describedby="${escapeAttr(descriptionId)} ${escapeAttr(statusId)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="toggle-slider"></span>
    </label>
  </div>`;
}

function renderContextSourceSection(key, title, subtitle, rows, { wide = false } = {}) {
  return `<section class="context-source-section${wide ? ' context-source-section-wide' : ''}" data-context-section="${escapeAttr(key)}">
    <div class="context-source-section-head">
      <span class="context-source-section-title">${escapeHTML(title)}</span>
      <span class="context-source-section-sub">${escapeHTML(subtitle)}</span>
    </div>
    <div class="context-source-list">${rows.join('')}</div>
  </section>`;
}

function renderContextSourceSummary({ insightOn, hasInsight, supplementsOn, hasSupplements, labStats, labOn, genomeSummaryOn, genomePriorityOn, genomeOn, hasGenomeSummary, hasGenome, lightOn, bodyOn, hasBody, nutritionOn, hasNutrition }) {
  /** @type {string[]} */
  const included = [];
  /** @type {string[]} */
  const excluded = [];
  /** @type {string[]} */
  const inactive = [];
  if (hasInsight) {
    if (insightOn) included.push('Insight Cards');
    else excluded.push('Insight Cards');
  } else inactive.push('Insight Cards');
  if (hasSupplements) {
    if (supplementsOn) included.push('Supplements & Meds');
    else excluded.push('Supplements & Meds');
  } else inactive.push('Supplements & Meds');
  if (labStats.totalMarkers > 0) {
    if (labOn) included.push('Blood markers');
    else excluded.push('Blood markers');
  } else inactive.push('Blood markers');
  for (const group of labStats.groups) {
    const title = getLabGroupTitle(group);
    if (!labOn) excluded.push(title);
    else if (isGroupInAIContext(group.name)) included.push(title);
    else excluded.push(title);
  }
  if (hasGenomeSummary) {
    if (genomeSummaryOn) included.push('APOE & mtDNA');
    else excluded.push('APOE & mtDNA');
  } else inactive.push('APOE & mtDNA');
  if (hasGenome) {
    if (genomePriorityOn) included.push('Priority SNPs');
    else excluded.push('Priority SNPs');
    if (genomeOn) included.push('Other SNPs');
    else excluded.push('Other SNPs');
  } else {
    inactive.push('Priority SNPs');
    inactive.push('Other SNPs');
  }
  if (lightOn) included.push('Light & Sun');
  else excluded.push('Light & Sun');
  if (hasBody) {
    if (bodyOn) included.push('Wearables');
    else excluded.push('Wearables');
  } else inactive.push('Wearables');
  if (hasNutrition) {
    if (nutritionOn) included.push('Meals & Nutrition');
    else excluded.push('Meals & Nutrition');
  } else inactive.push('Meals & Nutrition');
  const renderMetric = (tone, label, items, detail) => `<div class="context-summary-metric context-summary-${escapeAttr(tone)}" aria-label="${escapeAttr(`${label}: ${items.length ? items.join(', ') : 'none'}`)}">
    <span class="context-summary-count">${items.length}</span>
    <span class="context-summary-copy">
      <span class="context-summary-label">${escapeHTML(label)}</span>
      <span class="context-summary-detail">${escapeHTML(detail)}</span>
    </span>
  </div>`;
  return `<div class="context-source-summary" aria-label="Current context source summary">
    ${renderMetric('included', 'Included', included, 'Can influence results')}
    ${renderMetric('excluded', 'Off', excluded, 'Explicitly excluded')}
    ${renderMetric('unavailable', 'No data', inactive, 'Waiting for profile data')}
  </div>`;
}

function renderContextSourceControls() {
  const labStats = getLabSourceStats();
  const insightOn = isInsightContextCardsEnabled();
  const hasInsight = hasInsightContextData();
  const supplementsOn = isSupplementsMedsContextEnabled();
  const hasSupplements = hasSupplementsMedsData();
  const labOn = isLabMarkersContextEnabled();
  const hasGenome = hasGenomeSnpData();
  const hasGenomeSummary = hasGenomeSummaryData();
  const hasLight = hasLightSunData();
  const hasBody = hasWearableContextData();
  const hasNutrition = hasNutritionContextData();
  const genomeSummaryOn = isGeneticsSummaryInAIContext();
  const genomePriorityOn = isGeneticsPriorityInAIContext();
  const genomeOn = isGeneticsInventoryInAIContext();
  const lightOn = isLightSunContextEnabled();
  const bodyOn = isWearableContextEnabled();
  const nutritionOn = isNutritionContextEnabled();
  const nutritionContextDays = getNutritionContextDays();
  const insightRows = [
    renderContextSourceToggle({
      key: 'insight-cards',
      title: 'Insight Context Cards',
      description: 'Basic profile demographics, health goals, medical history, diet, exercise, sleep, stress, environment, notes, biometrics, and cycle context.',
      status: insightOn
        ? (hasInsight ? 'Profile and lifestyle cards are included.' : 'Enabled, but no Insight Context Cards are filled yet.')
        : 'Profile and lifestyle cards are ignored by AI context and score modifiers.',
      checked: insightOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
    renderContextSourceToggle({
      key: 'supplements-meds',
      title: 'Supplements & Medications',
      description: 'Tracked supplements, medications, ingredients, timing, mitochondrial warnings, and supplement-impact context.',
      status: supplementsOn
        ? (hasSupplements ? 'Supplements and medications are included independently.' : 'Enabled, but no supplements or medications are tracked yet.')
        : 'Supplements and medications are ignored by AI context and score modifiers.',
      checked: supplementsOn,
      child: true,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
  ];
  const labRows = [
    renderContextSourceToggle({
      key: 'lab-markers',
      title: 'Blood marker results',
      description: 'Imported lab values, ranges, trends, Biology Score context, marker notes, and flagged-result summaries.',
      status: labOn
        ? (labStats.totalMarkers ? `${labStats.totalMarkers} marker${labStats.totalMarkers !== 1 ? 's' : ''} included.` : 'Enabled, but no lab markers are imported yet.')
        : 'Imported blood marker values are ignored by AI context.',
      checked: labOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
    ...labStats.groups.map((group, index) => renderContextSourceToggle({
      key: `lab-group-${index}-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      toggleKey: 'lab-group',
      title: getLabGroupTitle(group),
      description: getLabGroupDescription(group),
      status: !labOn
        ? 'Prepared, but ignored while Blood marker results is off.'
        : (isGroupInAIContext(group.name) ? 'Included alongside core blood markers.' : 'Excluded until enabled here.'),
      checked: isGroupInAIContext(group.name),
      attrs: { group: group.name },
      child: true,
      affects: ['Chat', 'Scores'],
    })),
  ];
  const genomeRows = [
    renderContextSourceToggle({
      key: 'genome-summary',
      title: 'APOE & mtDNA summary',
      description: 'High-level inherited context such as APOE haplotype and mtDNA haplogroup.',
      status: hasGenomeSummary
        ? (genomeSummaryOn ? 'Included in AI context.' : 'Excluded from AI context.')
        : 'No APOE or mtDNA summary is stored yet.',
      checked: genomeSummaryOn && hasGenomeSummary,
      disabled: !hasGenomeSummary,
      affects: ['Chat', 'Scores'],
    }),
    renderContextSourceToggle({
      key: 'genome-priority',
      title: 'Priority SNP findings',
      description: 'Effectful or protective SNPs relevant to interpretation; normal/neutral calls stay out.',
      status: hasGenome
        ? (genomePriorityOn ? 'Included in AI context.' : 'Excluded from AI context.')
        : 'Import SNP data before this source can be enabled.',
      checked: genomePriorityOn && hasGenome,
      disabled: !hasGenome,
      affects: ['Chat', 'Scores'],
    }),
    renderContextSourceToggle({
      key: 'genome-lookup',
      title: 'Other SNP lookup inventory',
      description: 'All imported SNP calls, including neutral/no-impact calls from the Genome Lens Other SNPs inventory.',
      status: hasGenome
        ? (genomeOn ? 'Other SNPs may be included for direct lookup questions.' : 'Other SNPs are hidden from AI context.')
        : 'Import SNP data before this source can be enabled.',
      checked: genomeOn && hasGenome,
      disabled: !hasGenome,
      child: true,
      affects: ['Chat lookup'],
    }),
  ];
  const lightRows = [
    renderContextSourceToggle({
      key: 'light-sun',
      title: 'Light & Sun context',
      description: 'Light & Circadian card, aggregate sun and device logs, indoor light environment and audits, trends, calibration, and correlations. Camera images and raw session tables stay out.',
      status: lightOn
        ? (hasLight ? 'Included when relevant.' : 'No light data logged yet; low-light reminders may still be inferred.')
        : 'Ignored by chat context and light-related Biology Score modifiers.',
      checked: lightOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
  ];
  const bodyRows = [
    renderContextSourceToggle({
      key: 'body-wearables',
      title: 'Wearable recovery context',
      description: 'HRV, sleep, resting pulse, recovery, body metrics, and wearable trend summaries.',
      status: bodyOn
        ? (hasBody ? 'Included when available.' : 'Enabled, but no wearable summary is available yet.')
        : 'Ignored by chat context and Body-related Biology Score modifiers.',
      checked: bodyOn,
      affects: ['Chat', 'Scores'],
    }),
    renderContextSourceToggle({
      key: 'body-nutrition',
      title: 'Meals & Nutrition',
      description: 'Share compact nutrition summaries with chat and Agent Access. Individual meals, names, notes, ingredients, and photos stay out.',
      status: nutritionOn
        ? (hasNutrition
          ? (nutritionContextDays === 7
            ? 'Automatically includes the latest 7-day aggregate.'
            : `Automatically includes the latest 7 days and a ${nutritionContextDays}-day aggregate.`)
          : `Enabled with a ${nutritionContextDays}-day window, but no meals are logged yet.`)
        : 'Nutrition summaries are ignored by chat and external Agent Access.',
      checked: nutritionOn,
      affects: ['Chat', 'Agent'],
      controlHtml: `<label class="context-source-timeframe" for="nutrition-context-days"><span>Automatic timeframe</span><select id="nutrition-context-days" data-context-range="nutrition" aria-label="Meals & Nutrition automatic timeframe" ${nutritionOn ? '' : 'disabled'}>${NUTRITION_CONTEXT_DAY_OPTIONS.map(days => `<option value="${days}"${nutritionContextDays === days ? ' selected' : ''}>Last ${days} days</option>`).join('')}</select></label>`,
    }),
  ];
  return `<div class="context-source-panel">
    <div class="context-source-head">
      <span class="context-source-head-title">Data sources</span>
      <span class="context-source-head-sub">Choose exactly which profile data can influence AI answers and score context. The same source choices apply to external Agent Access.</span>
    </div>
    ${renderContextSourceSummary({ insightOn, hasInsight, supplementsOn, hasSupplements, labStats, labOn, genomeSummaryOn, genomePriorityOn, genomeOn, hasGenomeSummary, hasGenome, lightOn, bodyOn, hasBody, nutritionOn, hasNutrition })}
    <div class="context-source-sections">
      ${renderContextSourceSection('profile', 'Profile', 'Personal profile context, with meds and supplements controlled separately.', insightRows)}
      ${renderContextSourceSection('genome', 'Genome', 'Inherited context split by sensitivity and token cost.', genomeRows)}
      ${renderContextSourceSection('labs', 'Labs', 'Blood markers and imported specialty panels.', labRows, { wide: true })}
      ${renderContextSourceSection('light-sun', 'Light & Sun', 'Light exposure context, logged sessions, and score modifiers.', lightRows)}
      ${renderContextSourceSection('body', 'Body', 'Wearables and recovery signals.', bodyRows)}
    </div>
  </div>`;
}

function renderAnswerGroundingPanel({ lensSet, kbSet, kbEnabled, kbSummary, check }) {
  const kbStatus = kbSet
    ? `${escapeHTML(kbSummary.displayName || 'Knowledge Base')} is enabled. Click to manage documents and retrieval.`
    : (kbEnabled
      ? 'Knowledge Base is enabled, but no documents are indexed yet. Add a library before it can ground answers.'
      : 'Ground answers in your own documents, research papers, notes, and references.');
  return `<div class="context-grounding-panel">
    <div class="context-source-head">
      <span class="context-source-head-title">Answer grounding</span>
      <span class="context-source-head-sub">Optional instructions and documents that guide how AI answers, separate from profile data.</span>
    </div>
    <div class="ai-picker-grid">
      <button type="button" class="ai-picker-card" data-pick="lens">
        <span class="ai-picker-kicker">Interpretive Lens</span>
        <span class="ai-picker-title">Personalize how AI answers ${lensSet ? check : ''}</span>
        <span class="ai-picker-sub">${lensSet ? 'Interpretive Lens is enabled. Click to review or edit it.' : 'Set the interpretive lens: researchers, paradigms, or schools of thought.'}</span>
        <span class="ai-picker-action">${lensSet ? 'Review lens' : 'Set lens'} &rarr;</span>
      </button>
      <button type="button" class="ai-picker-card" data-pick="kb">
        <span class="ai-picker-kicker">Retrieval</span>
        <span class="ai-picker-title">Knowledge Base ${kbSet ? check : ''}</span>
        <span class="ai-picker-sub">${kbStatus}</span>
        <span class="ai-picker-action">${kbSet ? 'Manage source' : (kbEnabled ? 'Add documents' : 'Connect source')} &rarr;</span>
      </button>
    </div>
  </div>`;
}

export function openDataProtectionPicker() {
  let overlay = document.getElementById('data-protection-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'data-protection-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    closeModalOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const s = getDataProtectionStatus();
  const card = (key, icon, title, sub, configured) => `
    <button type="button" class="dashboard-picker-card" data-pick="${key}" ${configured ? 'data-configured="true"' : ''}>
      <span class="dashboard-picker-icon" aria-hidden="true">${icon}</span>
      <span class="dashboard-picker-title">${title} ${configured ? '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>' : ''}</span>
      <span class="dashboard-picker-sub">${sub}</span>
      <span class="dashboard-picker-action">${configured ? 'Configured' : 'Set up &rarr;'}</span>
    </button>`;
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Protect your data" style="max-width:560px">
    <p class="confirm-message" style="margin-bottom:14px">Protect your data</p>
    <div class="dashboard-picker-grid">
      ${card('encryption', '&#128274;', 'Encryption', 'Encrypt your data at rest with a passphrase. Browser extensions and anyone with disk access cannot read it without the passphrase.', s.encryption)}
      ${card('sync', '&#128225;', 'Cross-device Sync', 'End-to-end encrypted sync to your other devices. A 24-word mnemonic is your only key; the relay sees ciphertext.', s.sync)}
      ${s.backupSupported
        ? card('backup', '&#128190;', 'Auto-backup', 'Save daily snapshots to a local folder (Proton Drive, Dropbox, NAS, USB drive). Survives browser crashes and reinstalls.', s.backup)
        : ''}
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="data-protection-picker-cancel">Close</button>
    </div>
  </div>`;
  openModalOverlay(overlay, {
    initialFocus: '.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel',
    focusDelay: 50,
  });
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const cancelButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#data-protection-picker-cancel'));
  if (cancelButton) cancelButton.onclick = close;
  overlay.querySelectorAll('.dashboard-picker-card').forEach(btn => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.onclick = () => {
      const pick = button.getAttribute('data-pick');
      const isConfigured = button.getAttribute('data-configured') === 'true';
      if (isConfigured) { close(); return; }
      close();
      if (pick === 'encryption') dashboardAIDataProtectionDeps.showEnableEncryptionModal();
      else if (pick === 'sync') dashboardAISyncSetupHandler();
      else if (pick === 'backup') dashboardAIDataProtectionDeps.pickFolderForBackup();
    };
  });
}

function applyContextSourceToggle(input) {
  const key = input.dataset.contextToggle || '';
  const checked = input.checked;
  if (key === 'insight-cards') setInsightContextCardsEnabled(checked);
  else if (key === 'supplements-meds') setSupplementsMedsContextEnabled(checked);
  else if (key === 'lab-markers') setLabMarkersContextEnabled(checked);
  else if (key === 'lab-group') {
    const row = input.closest('.context-source-row');
    const group = row?.getAttribute('data-context-group') || '';
    if (group) setGroupInAIContext(group, checked);
  } else if (key === 'genome-summary') setGeneticsSummaryInAIContext(checked);
  else if (key === 'genome-priority') setGeneticsPriorityInAIContext(checked);
  else if (key === 'genome-lookup') setGeneticsInventoryInAIContext(checked);
  else if (key === 'light-sun') setLightSunContextEnabled(checked);
  else if (key === 'body-wearables') setWearableContextEnabled(checked);
  else if (key === 'body-nutrition') setNutritionContextEnabled(checked);
}

function bindContextSourceToggles(overlay) {
  overlay.querySelectorAll('[data-context-toggle]').forEach(inputEl => {
    const input = /** @type {HTMLInputElement} */ (inputEl);
    input.onchange = () => {
      const focusId = input.id;
      applyContextSourceToggle(input);
      void saveImportedData({ reason: 'context-source-settings' });
      const panel = overlay.querySelector('.context-source-panel');
      if (panel) {
        panel.outerHTML = renderContextSourceControls();
        bindContextSourceInputs(overlay);
        const next = /** @type {HTMLInputElement | null} */ (document.getElementById(focusId));
        next?.focus();
      }
      notifyDashboardAIContextStatusChanged();
    };
  });
}

function bindContextSourceRanges(overlay) {
  overlay.querySelectorAll('[data-context-range]').forEach(selectEl => {
    const select = /** @type {HTMLSelectElement} */ (selectEl);
    select.onchange = () => {
      const focusId = select.id;
      if (select.dataset.contextRange === 'nutrition') setNutritionContextDays(Number(select.value));
      void saveImportedData({ reason: 'context-source-settings' });
      const panel = overlay.querySelector('.context-source-panel');
      if (panel) {
        panel.outerHTML = renderContextSourceControls();
        bindContextSourceInputs(overlay);
        const next = /** @type {HTMLSelectElement | null} */ (document.getElementById(focusId));
        next?.focus();
      }
      notifyDashboardAIContextStatusChanged();
    };
  });
}

function bindContextSourceInputs(overlay) {
  bindContextSourceToggles(overlay);
  bindContextSourceRanges(overlay);
}

export function openContextModal() {
  if (migrateStoredContextSourceSettingsToProfile()) {
    void saveImportedData({ reason: 'context-source-settings-migration' });
  }
  let overlay = document.getElementById('context-hub-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'context-hub-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    closeModalOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const lensSet = !!(state.importedData.interpretiveLens || '').trim();
  let kbSummary; try { kbSummary = getLensSummary(); } catch { kbSummary = null; }
  const kbSet = !!kbSummary?.configured;
  const kbEnabled = !!kbSummary?.enabled;
  const check = '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>';
  overlay.innerHTML = `<div class="confirm-dialog gb-form-modal context-hub-dialog" role="dialog" aria-modal="true" aria-labelledby="context-hub-title" aria-describedby="context-hub-description">
    <div class="gb-modal-head context-hub-header">
      <div class="context-hub-heading">
        <div class="gb-modal-title" id="context-hub-title">Context</div>
        <p class="context-hub-subtext" id="context-hub-description">Control what can influence AI answers, Biology Scores, and source-driven warnings.</p>
      </div>
      <button type="button" class="modal-close context-hub-close" id="context-hub-close" aria-label="Close Context">&times;</button>
    </div>
    <div class="gb-form-body context-hub-body">
      <div class="context-hub-scroll">
        ${renderAnswerGroundingPanel({ lensSet, kbSet, kbEnabled, kbSummary, check })}
        ${renderContextSourceControls()}
      </div>
      <div class="gb-form-actions context-hub-actions">
        <span class="context-hub-save-note">Changes save automatically.</span>
        <button type="button" class="import-btn import-btn-primary" id="context-hub-cancel">Done</button>
      </div>
    </div>
  </div>`;
  openModalOverlay(overlay, {
    initialFocus: '.ai-picker-card,[data-context-toggle],#context-hub-cancel',
    focusDelay: 50,
    scrollLock: true,
  });
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const cancelButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#context-hub-cancel'));
  if (cancelButton) cancelButton.onclick = close;
  const closeButton = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#context-hub-close'));
  if (closeButton) closeButton.onclick = close;
  overlay.querySelectorAll('.ai-picker-card').forEach(btn => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.onclick = () => {
      const pick = button.getAttribute('data-pick');
      close();
      if (pick === 'lens') {
        openInterpretiveLensEditorRuntime();
      } else if (pick === 'kb') {
        openKnowledgeBaseModal();
      }
    };
  });
  bindContextSourceInputs(overlay);
}

export function openPersonalizeAIPicker() {
  openContextModal();
}
