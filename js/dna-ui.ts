import type { RelevantSnpFinding } from './dna.js';
import type { SnpAnnotation, SnpCatalog, SnpCatalogEntry } from './dna-evidence.js';
import type { GeneticsData, PendingDnaImport, StoredSnpCall } from './dna-runtime.js';
interface DnaUiDeps {
  findGenotypeInfo: typeof import('./dna.js').findGenotypeInfo | null;
  geneticsStalenessHint: ((genetics: GeneticsData) => string | null) | null;
  getSnpCategoryLabel: (category: unknown) => string; getSnpCategoryLabels: () => Record<string, string>;
  getSnpTable: () => SnpCatalog | null; handleDNAFile: typeof import('./dna.js').handleDNAFile | null;
  loadSnpTable: ((options?: Parameters<typeof import('./dna-evidence.js').loadSnpCatalog>[0]) => Promise<SnpCatalog>) | null;
  resolveAPOE: ((matches: PendingDnaImport['matches']) => string | null) | null; setImportRunning: ((running: boolean) => void) | null;
}
interface GeneticsFinding extends RelevantSnpFinding { catalogEntry: SnpCatalogEntry }
type PreviewFinding = StoredSnpCall & { rsid: string; presentation: ReturnType<typeof snpFindingPresentation>; evidenceProfile: ReturnType<typeof resolveSnpEvidenceProfile> };

// dna-ui.js — Genetics dashboard rendering and autosomal DNA modal owner.

import { state } from './state.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { renderGeneticsSectionView, captureGeneticsText, captureGeneticsAction, type GeneticsRowView, type GeneticsGroupView, type GeneticsMtdnaView, type GeneticsSectionView } from './genetics-section-presentation.js';
import { renderDnaImportPreview } from './dna-preview-presentation.js';
import { renderManualSnpDialog } from './dna-manual-presentation.js';
import {
  clearPendingDnaImport, ensureDnaModalOverlay,
  loadGeneticsStylesheetForAction,
  navigateDnaRoute,
  setPendingDnaImport,
} from './dna-runtime.js';
import { detectMtDNAMismatch } from './dna-mtdna.js';
import {
  mtdnaEvidenceIssueUrl,
  newSnpSuggestionIssueUrl,
  resolveSnpEvidenceProfile,
  snpEvidenceIssueUrl,
  snpFindingPresentation,
  snpFindingRank,
} from './dna-evidence.js';

const dnaUiDeps: DnaUiDeps = {
  findGenotypeInfo: null,
  geneticsStalenessHint: null,
  getSnpCategoryLabel: category => String(category || 'Other'),
  getSnpCategoryLabels: () => ({}),
  getSnpTable: () => null,
  handleDNAFile: null,
  loadSnpTable: null,
  resolveAPOE: null,
  setImportRunning: null,
};

export function configureDnaUi(deps: Partial<DnaUiDeps> = {}) {
  const previous = { ...dnaUiDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(dnaUiDeps, key) && typeof value === 'function') {
      (dnaUiDeps as Record<keyof DnaUiDeps, ((...args: never[]) => unknown) | null>)[key as keyof DnaUiDeps] = value as (...args: never[]) => unknown;
    }
  }
  return previous;
}

export function renderGeneticsSection() {
  const genetics = state.importedData.genetics as GeneticsData | null | undefined;
  const hasSnps = genetics && genetics.snps && Object.keys(genetics.snps!).length > 0;
  const hasMtdna = genetics && genetics.mtdna;
  if (!hasSnps && !hasMtdna) {
    return renderGeneticsSectionView({kind:'empty', actions:[
      captureGeneticsAction('import-file'), captureGeneticsAction('import-file'),
      captureGeneticsAction('import-snp-report'), captureGeneticsAction('add-manual-snp'),
    ]});
  }

  const snpTable = dnaUiDeps.getSnpTable();
  if (hasSnps && !snpTable) {
    dnaUiDeps.loadSnpTable?.().then(() => navigateDnaRoute('dashboard'));
    return '';
  }

  const snpCount = hasSnps ? Object.keys(genetics.snps!).length : 0;
  const apoe = genetics.apoe;
  const collapsed = localStorage.getItem('labcharts-genetics-collapsed') === '1';

  const byCat: Record<string, GeneticsFinding[]> = {};
  const otherByCat: Record<string, GeneticsFinding[]> = {};
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps || {})) {
    if (apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable?.[rsid];
    if (!entry) continue;
    const info = dnaUiDeps.findGenotypeInfo?.(entry, stored.genotype);
    if (!info) continue;
    const cat = entry.category || 'other';
    const presentation = snpFindingPresentation(info.effect, info.valence);
    const evidenceProfile = resolveSnpEvidenceProfile(entry, info);
    const isPrimary = ['risk', 'protective', 'trait'].includes(presentation.tone);
    const target = isPrimary ? byCat : otherByCat;
    if (!target[cat]) target[cat] = [];
    target[cat]!.push({
      rsid,
      gene: stored.gene || entry.gene,
      variant: stored.variant || entry.variant,
      genotype: stored.genotype,
      effect: info.effect,
      valence: info.valence || 'risk',
      note: info.note,
      references: entry.references || [],
      catalogEntry: entry,
      presentation,
      evidenceProfile,
      rank: snpFindingRank(evidenceProfile, presentation),
    });
  }

  const heaviest = (findings: readonly GeneticsFinding[]) => Math.min(...findings.map(finding => finding.rank ?? 999));
  const catOrder = Object.entries(byCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const totalFindings = catOrder.reduce((count, [, findings]) => count + findings.length, 0);
  const otherCatOrder = Object.entries(otherByCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const otherFindings = otherCatOrder.reduce((count, [, findings]) => count + findings.length, 0);

  const renderAssessment = (finding: SnpAnnotation & { evidenceProfile?: GeneticsFinding['evidenceProfile']; catalogEntry?: SnpCatalogEntry }) => {
    const profile = finding.evidenceProfile || resolveSnpEvidenceProfile(finding.catalogEntry, finding);
    return {
      evidenceClass: `genetics-axis genetics-axis-evidence genetics-axis-${captureGeneticsText(profile.evidenceLevel)}`,
      evidenceTitle: captureGeneticsText(profile.evidenceDescription), evidenceLabel: captureGeneticsText(profile.evidenceShortLabel),
      relevanceClass: `genetics-axis genetics-axis-relevance genetics-axis-${captureGeneticsText(profile.relevanceLevel)}`,
      relevanceTitle: captureGeneticsText(profile.relevanceDescription), relevanceLabel: captureGeneticsText(profile.relevanceShortLabel),
    };
  };
  const catLabels = dnaUiDeps.getSnpCategoryLabels();

  const metaParts: string[] = [];
  if (genetics.source) metaParts.push(captureGeneticsText(genetics.source));
  if (hasSnps) metaParts.push(`${snpCount} SNPs`);
  if (hasMtdna) metaParts.push(`mtDNA ${captureGeneticsText(genetics.mtdna!.haplogroup)}`);
  if (totalFindings > 0) metaParts.push(`${totalFindings} findings`);
  const latestDate = [genetics.importDate, genetics.mtdna?.importDate].filter(Boolean).sort().pop();
  if (latestDate) metaParts.push(latestDate);

  const headerActions = captureGeneticsAction('toggle-genetics-collapse');
  const meta = metaParts.join(' \u00B7 ');
  const arrowClass = `genetics-collapse-arrow${collapsed ? ' collapsed' : ''}`;
  const bodyClass = `genetics-body${collapsed ? ' hidden' : ''}`;

  const coverageFound = Number(genetics.coverage?.found);
  const coverageTotal = Number(genetics.coverage?.total);
  const hasCoverage = hasSnps && Number.isFinite(coverageFound) && Number.isFinite(coverageTotal) && coverageTotal > 0;
  const coveragePct = hasCoverage ? Math.round((coverageFound / coverageTotal) * 100) : null;
  const overviewCards = [
    {
      label: hasCoverage ? 'Catalog coverage' : 'Imported SNPs',
      value: hasCoverage ? `${coverageFound.toLocaleString()} / ${coverageTotal.toLocaleString()}` : (hasSnps ? snpCount.toLocaleString() : '0'),
      sub: hasCoverage ? `${coveragePct}% matched · ${genetics.source || 'DNA import'}` : (genetics.source || 'Autosomal raw data'),
    },
    {
      label: 'Findings',
      value: String(totalFindings),
      sub: totalFindings ? 'Interpreted from known SNPs' : 'No interpreted findings',
    },
    apoe ? {
      label: 'APOE',
      value: apoe,
      sub: 'Haplotype context',
    } : null,
    hasMtdna ? {
      label: 'mtDNA',
      value: genetics.mtdna!.haplogroup,
      sub: genetics.mtdna!.coupling?.shortLabel || 'Maternal lineage',
    } : null,
  ].filter(card => card !== null);

  const cards = overviewCards.map(card => ({
    label: captureGeneticsText(card.label), value: captureGeneticsText(card.value), sub: captureGeneticsText(card.sub),
  }));
  let mtdna: GeneticsMtdnaView | null = null;

  if (hasMtdna) {
    const mt = genetics.mtdna!;
    const mismatch = detectMtDNAMismatch(genetics);
    const haplogroup = captureGeneticsText(mt.haplogroup);
    let coupling: GeneticsMtdnaView['coupling'] = null;
    if (mt.coupling) coupling = {label: captureGeneticsText(mt.coupling.label), climate: captureGeneticsText(mt.coupling.climate)};
    const facts = [
      mt.origin ? {label:'Origin',value:captureGeneticsText(mt.origin)} : null,
      mt.source ? {label:'Source',value:captureGeneticsText(mt.source)} : null,
      Number.isFinite(Number(mt.matchedMutations)) && Number.isFinite(Number(mt.totalDiagnostic))
        ? {label:'Marker match',value:`${Number(mt.matchedMutations)} / ${Number(mt.totalDiagnostic)}`} : null,
    ].filter(fact => fact !== null);
    const details: string[] = [];
    if (mt.details) details.push(captureGeneticsText(mt.details));
    if (mt.coupling?.description) details.push(captureGeneticsText(mt.coupling.description));
    if (mt.coupling?.implications) details.push(captureGeneticsText(mt.coupling.implications));
    let match: GeneticsMtdnaView['match'] = null;
    if (mismatch && mismatch.mismatch) match = {classes:`genetics-mtdna-mismatch mismatch-${mismatch.severity}`,message:captureGeneticsText(mismatch.message)};
    else if (mismatch && !mismatch.mismatch) match = {classes:'genetics-mtdna-match',message:captureGeneticsText(mismatch.message)};
    const evidenceHref = captureGeneticsText(mtdnaEvidenceIssueUrl());
    const removeActions = captureGeneticsAction('delete-mtdna');
    mtdna = {haplogroup,coupling,facts,details,match,evidenceHref,removeActions};
  }
  let apoeView: GeneticsSectionView['apoe'] = null;

  if (apoe) {
    const apoeProfile = resolveSnpEvidenceProfile(snpTable?.rs429358 || snpTable?.rs7412 || {});
    apoeView = {value:captureGeneticsText(apoe),axes:renderAssessment({ evidenceProfile: apoeProfile })};
  }

  const groups: GeneticsGroupView[] = [];
  let more: GeneticsSectionView['more'] = null;
  if (totalFindings > 0) {
    let shown = 0;
    const INITIAL_LIMIT = 8;
    for (const [cat, findings] of catOrder) {
      findings.sort((a, b) => a.rank - b.rank);
      const catLabel = catLabels[cat] || cat;
      const startHidden = shown >= INITIAL_LIMIT;
      const group = {classes:`genetics-cat-group${startHidden ? ' genetics-extra' : ''}`,label:captureGeneticsText(catLabel),rows:[] as GeneticsRowView[]};
      for (const finding of findings) {
        const isExtra = shown >= INITIAL_LIMIT;
        const impact = finding.presentation;
        const primaryRef = (finding.references || []).find(ref => /^https?:\/\//i.test(String(ref || '')));
        const primaryHref = primaryRef ? captureGeneticsText(primaryRef) : null;
        const snpediaId = `${finding.rsid.charAt(0).toUpperCase()}${finding.rsid.slice(1)}`;
        const snpediaHref = 'https://www.snpedia.com/index.php/' + captureGeneticsText(encodeURIComponent(snpediaId));
        const correctionHref = captureGeneticsText(snpEvidenceIssueUrl(finding.rsid, finding.catalogEntry));
        const askActions = captureGeneticsAction('ask-ai-snp', { rsid: finding.rsid });
        const rowClasses = ['genetics-finding-row', `genetics-finding-${impact.tone}`];
        if (isExtra && !startHidden) rowClasses.push('genetics-extra');
        group.rows.push({
          classes:rowClasses.join(' '), dot:`${impact.icon}`,
          gene:captureGeneticsText(finding.gene || finding.rsid) + ' ' + captureGeneticsText(finding.variant || ''),
          rsid:captureGeneticsText(finding.rsid) + ' · ' + captureGeneticsText(catLabel),
          impactClass:`genetics-finding-impact genetics-impact-${impact.tone}`, impact:captureGeneticsText(impact.shortLabel),
          genotype:captureGeneticsText(finding.genotype), axes:renderAssessment(finding),
          note:captureGeneticsText(finding.note || 'Observed in your imported genotype.'),
          links:{primaryHref,snpediaHref,askActions,correctionHref},
        });
        shown++;
      }
      groups.push(group);
    }
    if (totalFindings > INITIAL_LIMIT) {
      more = {actions:captureGeneticsAction('toggle-genetics-expand'),count:`${totalFindings - INITIAL_LIMIT}`};
    }
  }

  const otherGroups: GeneticsGroupView[] = [];
  let otherCount = '';
  if (otherFindings > 0) {
    // Preserve original count interpolation before secondary row reads.
    const secondaryCount = `${otherFindings}`;
    for (const [cat, findings] of otherCatOrder) {
      findings.sort((a, b) => a.rank - b.rank);
      const catLabel = catLabels[cat] || cat;
      const group = {classes:'genetics-cat-group genetics-cat-group-secondary',label:captureGeneticsText(catLabel),rows:[] as GeneticsRowView[]};
      for (const finding of findings) {
        const impact = finding.presentation;
        group.rows.push({
          classes:`genetics-finding-row genetics-finding-${impact.tone}`, dot:`${impact.icon}`,
          gene:captureGeneticsText(finding.gene || finding.rsid) + ' ' + captureGeneticsText(finding.variant || ''),
          rsid:captureGeneticsText(finding.rsid) + ' · ' + captureGeneticsText(catLabel),
          impactClass:`genetics-finding-impact genetics-impact-${impact.tone}`, impact:captureGeneticsText(impact.shortLabel),
          genotype:captureGeneticsText(finding.genotype), axes:renderAssessment(finding),
          note:captureGeneticsText(finding.note || 'Observed in your imported genotype.'),links:null,
        });
      }
      otherGroups.push(group);
    }
    otherCount = secondaryCount;
  }

  const staleHint = dnaUiDeps.geneticsStalenessHint?.(genetics);
  const stale = staleHint ? captureGeneticsText(staleHint) : null;
  const actions: GeneticsSectionView['actions'] = [
    captureGeneticsAction('add-manual-snp'), captureGeneticsAction('import-snp-report'),
    captureGeneticsAction('reimport-dna'), captureGeneticsAction('delete-dna'),
  ];
  const issueHref = captureGeneticsText(newSnpSuggestionIssueUrl());
  return renderGeneticsSectionView({kind:'populated',headerActions,meta,arrowClass,bodyClass,
    cards,mtdna,apoe:apoeView,groups,more,otherGroups,otherCount,stale,actions,issueHref});
}

export function toggleGeneticsCollapse() {
  const body = document.querySelector('.genetics-body');
  const arrow = document.querySelector('.genetics-collapse-arrow');
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  arrow?.classList.toggle('collapsed', isHidden);
  localStorage.setItem('labcharts-genetics-collapsed', isHidden ? '1' : '0');
}

export function toggleGeneticsExpand(button: HTMLElement) {
  const container = document.querySelector('.genetics-findings');
  if (!container) return;
  const isExpanded = container.classList.toggle('expanded');
  if (!button.dataset.label) button.dataset.label = button.textContent!;
  button.textContent = isExpanded ? 'Show less' : button.dataset.label!;
}

export function reimportDNA() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void dnaUiDeps.handleDNAFile?.(file);
  };
  input.click();
}

let dnaModalEscapeBound = false;
let dnaBackdropMouseDownInside = false;

function nudgeDnaModal() {
  const dialog = document.querySelector('#dna-modal-overlay .modal');
  if (!(dialog instanceof HTMLElement)) return;
  dialog.classList.remove('modal-nudge');
  void dialog.offsetWidth;
  dialog.classList.add('modal-nudge');
  dialog.addEventListener('animationend', () => dialog.classList.remove('modal-nudge'), { once: true });
}

function handleDnaBackdropMouseDown(event: MouseEvent) {
  const target = event.target;
  dnaBackdropMouseDownInside = target instanceof Element && !!target.closest('.modal');
}

function handleDnaBackdropClick(event: MouseEvent) {
  const target = event.target;
  if (dnaBackdropMouseDownInside) {
    dnaBackdropMouseDownInside = false;
    return;
  }
  if (!(target instanceof Element) || target.id !== 'dna-modal-overlay') return;
  event.preventDefault();
  nudgeDnaModal();
}

function handleDnaModalEscape(event: KeyboardEvent) {
  const overlay = document.getElementById('dna-modal-overlay');
  if (event.key !== 'Escape' || !overlay?.classList.contains('show')) return;
  event.preventDefault();
  closeDNAImportPreview();
}

function openDnaModalOverlay(overlay: HTMLElement, initialFocus: string) {
  if (!overlay.dataset.dnaBackdropNudgeWired) {
    overlay.addEventListener('mousedown', handleDnaBackdropMouseDown);
    overlay.addEventListener('click', handleDnaBackdropClick);
    overlay.dataset.dnaBackdropNudgeWired = '1';
  }
  if (!dnaModalEscapeBound) {
    document.addEventListener('keydown', handleDnaModalEscape);
    dnaModalEscapeBound = true;
  }
  openModalOverlay(overlay, { initialFocus, focusDelay: 30, scrollLock: true });
}

export async function openManualSnpModal() {
  if (!await loadGeneticsStylesheetForAction()) return false;
  await dnaUiDeps.loadSnpTable?.();
  clearPendingDnaImport();
  const html = renderManualSnpDialog();
  const overlay = ensureDnaModalOverlay();
  overlay.innerHTML = html;
  openDnaModalOverlay(overlay, '#manual-snp-bulk');
  return true;
}

export function showDNAImportPreview(result: PendingDnaImport) {
  setPendingDnaImport(result);

  const apoe = dnaUiDeps.resolveAPOE?.(result.matches);
  const rawMatchedCount = Number(result.rawMatchedCount);
  const preservedOverrideCount = Number(result.preservedOverrideCount) || 0;
  const previewStats = preservedOverrideCount > 0
    ? `${result.totalLines.toLocaleString()} SNPs scanned · ${rawMatchedCount.toLocaleString()} found in file · ${result.coverage.found} available after preserving ${preservedOverrideCount} curated override${preservedOverrideCount === 1 ? '' : 's'}`
    : `${result.totalLines.toLocaleString()} SNPs scanned · ${result.coverage.found} of ${result.coverage.total} health-relevant SNPs found`;
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  const risk: PreviewFinding[] = [];
  const protective: PreviewFinding[] = [];
  const informational: PreviewFinding[] = [];
  const none: PreviewFinding[] = [];
  for (const [rsid, match] of Object.entries(result.matches)) {
    if (apoeRsids.has(rsid)) continue;
    const presentation = snpFindingPresentation(match.effect, match.valence);
    const evidenceProfile = resolveSnpEvidenceProfile(match, match);
    const item = {
      rsid,
      ...match,
      presentation,
      evidenceProfile,
    };
    if (presentation.tone === 'risk') risk.push(item);
    else if (presentation.tone === 'protective') protective.push(item);
    else if (presentation.tone === 'trait') informational.push(item);
    else none.push(item);
  }

  const html = renderDnaImportPreview({
    source: () => result.source,
    stats: previewStats,
    apoe,
    groups: [risk, protective, informational, none],
    categoryLabel: category => dnaUiDeps.getSnpCategoryLabel(category),
    importCount: () => result.coverage.found,
  });

  const overlay = ensureDnaModalOverlay();
  overlay.innerHTML = html;
  openDnaModalOverlay(overlay, '.import-btn-primary');
}

export function closeDNAImportPreview() {
  clearPendingDnaImport();
  dnaUiDeps.setImportRunning?.(false);
  closeModalOverlay('dna-modal-overlay');
  if (dnaModalEscapeBound) {
    document.removeEventListener('keydown', handleDnaModalEscape);
    dnaModalEscapeBound = false;
  }
}
