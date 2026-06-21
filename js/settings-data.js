// @ts-check
// settings-data.js - Settings data-entry management and AI usage helpers.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, isDebugMode, setPIIReviewEnabled } from './utils.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { loadPdfImport } from './import-loader.js';

export function renderDataEntriesSection() {
  const rawEntries = state.importedData?.entries || [];
  const entries = [];
  for (const entry of rawEntries) {
    if (Object.keys(entry?.markers || {}).length > 0) entries.push(entry);
  }
  if (entries.length === 0) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No data yet. Drop a PDF or JSON file on the dashboard, or add values manually.</div>';
  }
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const manualValues = state.importedData.manualValues || {};
  let html = '';
  for (const entry of sorted) {
    const d = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const cnt = Object.keys(entry.markers).length;
    const entryMarkerKeys = Object.keys(entry.markers);
    const manualCount = entryMarkerKeys.filter(k => manualValues[k + ':' + entry.date]).length;
    const isFullyManual = !entry.importedWith && manualCount === cnt;
    const files = entry.sourceFiles || (entry.sourceFile ? [entry.sourceFile] : []);
    const fileLabel = files.length > 0
      ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px;border-bottom:1px dashed var(--text-muted);cursor:help" title="${escapeAttr(files.join('\n'))}">${files.length === 1 ? escapeHTML(files[0].length > 30 ? files[0].slice(0, 27) + '...' : files[0]) : files.length + ' files'}</span>`
      : '';
    const sourceLabel = isFullyManual
      ? '<span style="color:var(--accent);margin-left:8px;font-size:11px">manual entry</span>'
      : entry.importedWith?.modelId
        ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px">${escapeHTML(entry.importedWith.modelId)}</span>`
        : manualCount > 0
          ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px">${manualCount} manual</span>`
          : '';
    const dateAttr = escapeAttr(entry.date);
    html += `<div class="imported-entry">
      <span class="ie-info"><span class="ie-date">${d}</span><span class="ie-count">${cnt} markers</span>${fileLabel}${sourceLabel}</span>
      <div class="ie-actions">
        <button class="ie-edit" data-settings-action="rename-imported-entry" data-entry-date="${dateAttr}" title="Edit collection date">Edit date</button>
        <button class="ie-remove" data-settings-action="remove-imported-entry" data-entry-date="${dateAttr}">Remove</button>
      </div>
    </div>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="import-btn import-btn-primary" data-settings-action="share-profile">Share Profile</button>
    <button class="import-btn import-btn-secondary" data-settings-action="export-client">Export Client</button>
    <button class="import-btn import-btn-secondary" data-settings-action="export-all-clients" title="Full backup \u2014 all profiles, data, and chat history">Export All Clients</button>
    <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" data-settings-action="clear-all-data">Clear All Data</button></div>`;
  return html;
}

export function refreshDataEntriesSection() {
  const el = document.getElementById('data-entries-section');
  if (el) el.innerHTML = renderDataEntriesSection();
}

export async function removeImportedEntryFromSettings(date) {
  try {
    const { removeImportedEntry } = await loadPdfImport();
    const ok = await removeImportedEntry(date);
    if (ok) refreshDataEntriesSection();
  } catch (err) {
    if (isDebugMode()) console.error('Remove imported entry failed:', err);
    showNotification('Could not remove imported data. Reload and try again.', 'error');
  }
}

export async function renameImportedEntryDateFromSettings(date) {
  try {
    const { renameImportedEntryDate } = await loadPdfImport();
    const ok = await renameImportedEntryDate(date);
    if (ok) refreshDataEntriesSection();
  } catch (err) {
    if (isDebugMode()) console.error('Rename imported entry failed:', err);
    showNotification('Could not edit the import date. Reload and try again.', 'error');
  }
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export function renderAIUsageSection() {
  const pu = getProfileUsage(state.currentProfile);
  const gu = getGlobalUsage();
  const profileName = state.profiles?.[state.currentProfile]?.name || 'Current profile';
  const separator = ' \u00b7 ';
  let html = '<div style="font-size:13px;color:var(--text-secondary);line-height:2">';
  html += `<div><strong>${escapeHTML(profileName)}</strong>: ${formatCost(pu.totalCost)}${separator}${pu.requestCount} request${pu.requestCount !== 1 ? 's' : ''}${separator}${formatTokens(pu.totalInputTokens + pu.totalOutputTokens)} tokens</div>`;
  html += `<div><strong>All profiles</strong>: ${formatCost(gu.totalCost)}${separator}${gu.requestCount} request${gu.requestCount !== 1 ? 's' : ''}${separator}${formatTokens(gu.totalInputTokens + gu.totalOutputTokens)} tokens</div>`;
  html += '</div>';
  if (pu.requestCount > 0) {
    html += `<button class="import-btn import-btn-secondary" style="margin-top:8px;font-size:11px" data-settings-action="reset-profile-usage">Reset profile usage</button>`;
  }
  return html;
}

export function resetCurrentProfileUsage() {
  resetProfileUsage(state.currentProfile);
  const el = document.getElementById('ai-usage-section');
  if (el) el.innerHTML = renderAIUsageSection();
}

// Disable confirmation for the PII review toggle. On->off shows a one-time
// warning so users do not silently lose visibility into what is leaving their
// device. Re-enabling and the initial setup are silent.
export async function confirmDisablePIIReview(checkbox) {
  if (checkbox.checked) {
    setPIIReviewEnabled(true);
    return;
  }
  const acknowledged = localStorage.getItem('labcharts-pii-review-disable-ack') === '1';
  if (acknowledged) {
    setPIIReviewEnabled(false);
    return;
  }
  // Restore the toggle while the dialog is open; commit only on confirm.
  checkbox.checked = true;
  if (await showConfirmDialog(
    "Turn off the obfuscation review?\n\nWith this off, getbased's PII detector runs but you won't see the result before it's sent to the AI provider. Recommended only after you've verified the obfuscation works on your data."
  )) {
    localStorage.setItem('labcharts-pii-review-disable-ack', '1');
    setPIIReviewEnabled(false);
    checkbox.checked = false;
  }
}
