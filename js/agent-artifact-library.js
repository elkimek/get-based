// @ts-check
// agent-artifact-library.js — small durable draft-artifact library for app-agent outputs.

import { escapeAttr, escapeHTML, showNotification } from './utils.js';
import { state } from './state.js';
import { createPrelabChecklistFromLabPlan, ensureAgentArtifacts } from './agent-artifacts.js';
import { buildMessageCopyText } from './chat-actions.js';

const ACTION_ATTR = 'data-agent-artifact-action';
const ID_ATTR = 'data-agent-artifact-id';
const SELECTOR = `[${ACTION_ATTR}]`;

function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

function actionAttrs(action, id) {
  return `${ACTION_ATTR}="${escapeAttr(action)}" ${ID_ATTR}="${escapeAttr(id)}"`;
}

function planPreview(plan) {
  const markers = [];
  for (const bundle of plan?.bundles || []) {
    for (const marker of bundle.markers || []) markers.push(marker);
  }
  return markers.slice(0, 8).join(', ');
}

function renderLabPlan(plan) {
  const preview = planPreview(plan);
  return `<article class="agent-artifact-card" data-agent-artifact-id="${escapeAttr(plan.id || '')}">
    <div class="agent-proposal-kicker">${escapeHTML(plan.source || 'agent')} · ${escapeHTML(plan.artifactType || 'labPlanDraft')}</div>
    <strong>${escapeHTML(plan.title || 'Draft lab plan')}</strong>
    ${plan.summary ? `<p>${escapeHTML(plan.summary)}</p>` : ''}
    ${preview ? `<p class="agent-artifact-preview">${escapeHTML(preview)}</p>` : ''}
    <div class="agent-proposal-actions">
      <button type="button" class="chat-action-btn" ${actionAttrs('copy-lab-plan', plan.id || '')}>Copy plan</button>
      <button type="button" class="chat-action-btn" ${actionAttrs('create-prelab-checklist', plan.id || '')}>Create prelab checklist</button>
    </div>
  </article>`;
}

function renderChecklist(item) {
  return `<article class="agent-artifact-card" data-agent-artifact-id="${escapeAttr(item.id || '')}">
    <div class="agent-proposal-kicker">${escapeHTML(item.source || 'agent')} · ${escapeHTML(item.artifactType || 'prelabChecklist')}</div>
    <strong>${escapeHTML(item.title || 'Prelab checklist')}</strong>
    <p>${escapeHTML(item.items?.length || 0)} marker${item.items?.length === 1 ? '' : 's'} · ${escapeHTML(item.safetyNote || 'Draft only.')}</p>
  </article>`;
}

export function renderAgentArtifactLibrary(opts = {}) {
  const artifacts = ensureAgentArtifacts(importedFrom(opts));
  const plans = artifacts.labPlans || [];
  const checklists = artifacts.prelabChecklists || [];
  const rows = [
    ...plans.map(renderLabPlan),
    ...checklists.map(renderChecklist),
  ].join('');
  return `<section class="agent-artifact-library" aria-label="Agent drafts">
    <div class="agent-proposal-kicker">Agent drafts</div>
    <h3>Agent drafts</h3>
    ${rows || '<p class="agent-proposal-empty">No saved agent drafts yet.</p>'}
  </section>`;
}

async function copyLabPlan(planId) {
  const plan = ensureAgentArtifacts(state.importedData).labPlans.find(item => item?.id === planId);
  if (!plan) return false;
  const text = buildMessageCopyText({ role: 'assistant', content: plan.title || 'Draft lab plan', labPlanDraft: plan });
  if (!navigator.clipboard?.writeText) {
    showNotification?.('Clipboard is unavailable in this browser. Open the card and copy manually.', 'error');
    return false;
  }
  await navigator.clipboard.writeText(text);
  showNotification?.('Lab plan copied', 'success');
  return true;
}

function rerenderProfileContext() {
  const appWindow = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  if (typeof appWindow.renderContextCards === 'function') return appWindow.renderContextCards();
  if (typeof appWindow.renderProfileContextCards === 'function') {
    const main = typeof document !== 'undefined' ? document.querySelector('main') : null;
    if (main) main.innerHTML = appWindow.renderProfileContextCards();
  }
}

async function handleArtifactClick(event) {
  const el = event.target?.closest?.(SELECTOR);
  if (!el) return;
  event.preventDefault();
  const action = el.getAttribute(ACTION_ATTR) || '';
  const id = el.getAttribute(ID_ATTR) || '';
  if (action === 'copy-lab-plan') await copyLabPlan(id);
  else if (action === 'create-prelab-checklist') {
    const checklist = await createPrelabChecklistFromLabPlan(id);
    if (checklist) showNotification?.('Prelab checklist drafted', 'success');
  } else return;
  rerenderProfileContext();
}

let installed = false;
export function installAgentArtifactLibrary(root = typeof document !== 'undefined' ? document : null) {
  if (!root || installed) return;
  installed = true;
  root.addEventListener('click', handleArtifactClick);
}

installAgentArtifactLibrary();

const artifactWindow = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
artifactWindow.renderAgentArtifactLibrary = renderAgentArtifactLibrary;
artifactWindow.createPrelabChecklistFromLabPlan = createPrelabChecklistFromLabPlan;
