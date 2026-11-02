// longevity-tools-view.ts — "Longevity Tools" screen (route "longevity-tools").
//
// Lists the interpreters, calculators and biomarker pages of
// longevity-tools.com. Clicking one opens the site in a new window with the
// user's latest stored values in the URL hash. The hash never reaches the
// site's server (client-side only), but the user is told what is shared.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { openUtilsRuntimeWindow } from './utils-runtime.js';
import { getProfileAgeYears } from './profile-context.js';
import { getProfileHeight } from './profile.js';
import { resolveNutritionWeight } from './nutrition-targets.js';
import { bodyMeasurementRecords } from './body-measurement-model.js';
import {
  LONGEVITY_TOOLS, LONGEVITY_SECTIONS, LONGEVITY_UNFILLED_PARAMS, buildLongevityToolUrl,
  type LongevityTool, type LongevityValues, type LongevityValue,
} from './longevity-tools-catalog.js';
import { collectLongevityValues, type LongevityEntryLike } from './longevity-tools-values.js';

type Filter = 'all' | 'tools' | 'biomarkers';
const ui: { filter: Filter; search: string; onlyWithData: boolean } = { filter: 'all', search: '', onlyWithData: false };
const delegated = new WeakSet<HTMLElement>();

const UNFILLED = new Set<string>(LONGEVITY_UNFILLED_PARAMS);
const PARAM_LABELS: Record<string, string> = {
  age: 'Age', gender: 'Sex', weight: 'Weight', height: 'Height', 'BP-sys': 'BP systolic', 'BP-dia': 'BP diastolic', waistCirc: 'Waist',
  'Dx-diabetes': 'Diabetes (yes/no)', smoking: 'Smoking', 'Rx-lipidLowering': 'Lipid-lowering drug', 'Rx-antihypertensive': 'BP drug',
  race: 'Race', gripStrength: 'Grip strength', 'S-TgAb-Roche': 'TgAb (Roche)',
};

function latestBloodPressure(): { sys: number; dia: number; date: string } | null {
  const data = state.importedData as unknown as { biometrics?: { bp?: Array<{ date?: string; systolic?: number; diastolic?: number; sys?: number; dia?: number }> }; wearableSummary?: { metrics?: Record<string, { latest?: number; latestDate?: string } | undefined> } } | null;
  const candidates: Array<{ sys: number; dia: number; date: string }> = [];
  for (const row of data?.biometrics?.bp || []) {
    const sys = Number(row.sys ?? row.systolic), dia = Number(row.dia ?? row.diastolic);
    if (Number.isFinite(sys) && Number.isFinite(dia) && sys > 0 && dia > 0) candidates.push({ sys, dia, date: String(row.date || '') });
  }
  const m = data?.wearableSummary?.metrics;
  const sys = Number(m?.bp_systolic?.latest), dia = Number(m?.bp_diastolic?.latest);
  if (Number.isFinite(sys) && Number.isFinite(dia) && sys > 0 && dia > 0) candidates.push({ sys, dia, date: String(m?.bp_systolic?.latestDate || m?.bp_diastolic?.latestDate || '') });
  return candidates.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function profileHeightCm(): number | null {
  const { height, unit } = getProfileHeight(state.currentProfile);
  const n = Number(height);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /^in/i.test(String(unit)) ? n * 2.54 : n;
}

function latestWaist(): { cm: number; date: string } | null {
  const rows = bodyMeasurementRecords((state.importedData || {}) as Parameters<typeof bodyMeasurementRecords>[0], 'waist');
  const row = rows.find(r => r.position === 'standing') || rows[0];
  return row ? { cm: row.valueCm, date: row.date } : null;
}

export function getLongevityValues(): LongevityValues {
  const weight = resolveNutritionWeight();
  const kg = weight?.kg != null ? Number(weight.kg) : NaN;
  return collectLongevityValues({
    entries: ((state.importedData as { entries?: LongevityEntryLike[] } | null)?.entries) || [],
    ageYears: getProfileAgeYears(),
    sex: state.profileSex || null,
    weight: Number.isFinite(kg) && kg > 0 ? { kg, date: String(weight?.date || '') } : null,
    heightCm: profileHeightCm(),
    bp: latestBloodPressure(),
    waistCm: latestWaist(),
  });
}

function paramLabel(id: string): string {
  return PARAM_LABELS[id] || id.replace(/^[SBPU]-/, '');
}

function fmt(v: LongevityValue | string): string {
  if (typeof v === 'string') return v;
  const n = parseFloat(v.value.toPrecision(4));
  return `${n} ${v.unit === 'years' ? 'y' : v.unit}`;
}

function matches(tool: LongevityTool): boolean {
  if (ui.filter === 'tools' && tool.kind === 'biomarker') return false;
  if (ui.filter === 'biomarkers' && tool.kind !== 'biomarker') return false;
  if (!ui.search) return true;
  const q = ui.search.toLowerCase();
  return `${tool.title} ${tool.section} ${tool.desc || ''} ${tool.inputs.join(' ')}`.toLowerCase().includes(q);
}

function toolCard(tool: LongevityTool, values: LongevityValues): string {
  const { filled, missing } = buildLongevityToolUrl(tool, values);
  const labMissing = missing.filter(id => !UNFILLED.has(id));
  const askOnSite = missing.filter(id => UNFILLED.has(id));
  if (ui.onlyWithData && !filled.some(id => id !== 'age' && id !== 'gender')) return '';
  const kindLabel = tool.kind === 'bioage' ? 'Bio-age' : tool.kind === 'interpreter' ? 'Interpreter' : tool.kind === 'calculator' ? 'Calculator' : 'Biomarker';
  const single = tool.kind === 'biomarker' ? values[tool.inputs[0]!] : undefined;
  const valueLine = tool.kind === 'biomarker'
    ? (single ? `<div class="lt-value">${escapeHTML(fmt(single))}${typeof single !== 'string' && single.date ? `<span class="lt-date">${escapeHTML(single.date)}</span>` : ''}</div>` : '<div class="lt-value lt-none">no value</div>')
    : `<div class="lt-coverage"><span class="lt-pill ${labMissing.length ? (filled.length ? 'lt-partial' : 'lt-empty') : 'lt-full'}">${filled.length}/${tool.inputs.length} prefilled</span></div>`;
  const chips = tool.kind === 'biomarker' ? '' : `<div class="lt-chips">${tool.inputs.map(id => {
    const v = values[id];
    const cls = v != null ? 'lt-chip-ok' : UNFILLED.has(id) ? 'lt-chip-ask' : 'lt-chip-miss';
    const title = v != null ? `${fmt(v)}${typeof v !== 'string' && v.date ? ` · ${v.date}` : ''}` : UNFILLED.has(id) ? 'Answer on the site' : 'No value in get-based — enter on the site';
    return `<span class="lt-chip ${cls}" title="${escapeAttr(title)}">${escapeHTML(paramLabel(id))}</span>`;
  }).join('')}</div>`;
  const note = askOnSite.length && tool.kind !== 'biomarker' ? `<div class="lt-note">Answer on the site: ${escapeHTML(askOnSite.map(paramLabel).join(', '))}</div>` : '';
  return `<button type="button" class="lt-card lt-kind-${escapeAttr(tool.kind)}${tool.kind === 'biomarker' && !single ? ' lt-dim' : ''}" data-lt-open="${escapeAttr(tool.path)}" title="${escapeAttr(`Open ${tool.title} on longevity-tools.com in a new window`)}">
    <div class="lt-card-head"><span class="lt-kind">${escapeHTML(kindLabel)}</span><span class="lt-ext" aria-hidden="true">↗</span></div>
    <div class="lt-title">${escapeHTML(tool.title)}</div>
    ${tool.desc ? `<div class="lt-desc">${escapeHTML(tool.desc)}</div>` : ''}
    ${valueLine}${chips}${note}
  </button>`;
}

function render(main: HTMLElement) {
  const values = getLongevityValues();
  const visible = LONGEVITY_TOOLS.filter(matches);
  const sections = LONGEVITY_SECTIONS.map(section => {
    const tools = visible.filter(t => t.section === section && t.kind !== 'biomarker');
    const markers = visible.filter(t => t.section === section && t.kind === 'biomarker');
    const toolHtml = tools.map(t => toolCard(t, values)).join('');
    const markerHtml = markers.map(t => toolCard(t, values)).join('');
    if (!toolHtml && !markerHtml) return '';
    return `<section class="lt-section"><h3 class="lt-section-title">${escapeHTML(section)}</h3>
      ${toolHtml ? `<div class="lt-grid lt-grid-tools">${toolHtml}</div>` : ''}
      ${markerHtml ? `<div class="lt-grid lt-grid-markers">${markerHtml}</div>` : ''}</section>`;
  }).join('');
  const labCount = Object.values(values).filter(v => typeof v !== 'string' && !['profile.age', 'profile.height', 'body.weight', 'body.bpSystolic', 'body.bpDiastolic', 'body.waist'].includes(v.label)).length;
  const profileBits = ['age', 'gender', 'weight', 'height', 'BP-sys', 'waistCirc'].map(id => values[id] != null ? `${paramLabel(id)} ${fmt(values[id]!)}` : `<span class="lt-missing">${paramLabel(id)} —</span>`);
  const seg = (f: Filter, label: string) => `<button type="button" class="lt-seg${ui.filter === f ? ' active' : ''}" data-lt-filter="${f}" aria-pressed="${ui.filter === f}">${label}</button>`;
  main.innerHTML = `<div class="lt-root">
    <div class="category-header lens-page-header"><h2>Longevity Tools</h2>
      <p>Interpreters and calculators from longevity-tools.com, pre-filled with your latest values</p></div>
    <div class="lt-toolbar">
      <div class="lt-segs" role="group" aria-label="Show">${seg('all', 'All')}${seg('tools', 'Tools')}${seg('biomarkers', 'Biomarkers')}</div>
      <input type="search" class="lt-search" data-lt-search placeholder="Search tools or biomarkers…" value="${escapeAttr(ui.search)}" aria-label="Search">
      <label class="lt-check"><input type="checkbox" data-lt-only${ui.onlyWithData ? ' checked' : ''}> Only with my data</label>
    </div>
    <div class="lt-summary">
      <span><strong>${labCount}</strong> lab values available</span>
      <span class="lt-profile">${profileBits.map(b => b.startsWith('<') ? b : escapeHTML(b)).join(' · ')}</span>
      <span class="lt-privacy" title="Values are placed in the URL hash (#…). Browsers do not send the hash in the HTTP request, but the site's own scripts read it to fill the calculator.">Opening a tool shares the listed values with longevity-tools.com via the URL hash.</span>
    </div>
    ${sections || '<div class="dashboard-widget-empty">Nothing matches the search.</div>'}
  </div>`;
}

function openTool(path: string) {
  const tool = LONGEVITY_TOOLS.find(t => t.path === path);
  if (!tool) return;
  const { url } = buildLongevityToolUrl(tool, getLongevityValues());
  openUtilsRuntimeWindow(url, '_blank', 'noopener,noreferrer');
}

function bind(main: HTMLElement) {
  if (delegated.has(main)) return;
  delegated.add(main);
  main.addEventListener('click', event => {
    if (state.currentView !== 'longevity-tools') return;
    const target = event.target as HTMLElement;
    const open = target.closest<HTMLElement>('[data-lt-open]');
    if (open) { openTool(open.dataset.ltOpen || ''); return; }
    const filter = target.closest<HTMLElement>('[data-lt-filter]');
    if (filter) { ui.filter = (filter.dataset.ltFilter as Filter) || 'all'; render(main); }
  });
  main.addEventListener('input', event => {
    if (state.currentView !== 'longevity-tools') return;
    const el = event.target as HTMLInputElement;
    if (!el.matches('[data-lt-search]')) return;
    ui.search = el.value;
    const pos = el.selectionStart;
    render(main);
    const next = main.querySelector<HTMLInputElement>('[data-lt-search]');
    if (next) { next.focus(); if (pos != null) next.setSelectionRange(pos, pos); }
  });
  main.addEventListener('change', event => {
    if (state.currentView !== 'longevity-tools') return;
    const el = event.target as HTMLInputElement;
    if (el.matches('[data-lt-only]')) { ui.onlyWithData = el.checked; render(main); }
  });
}

export function showLongevityTools(data: unknown): boolean {
  void data;
  const main = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (!main) return false;
  render(main);
  bind(main);
  return true;
}
