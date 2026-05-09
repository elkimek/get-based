// nav.js — Sidebar, compact profile button

import { state } from './state.js';
import { escapeHTML, escapeAttr, hashString } from './utils.js';
import { getActiveData, countFlagged, filterDatesByRange } from './data.js';
import { getProfiles } from './profile.js';

// Render a conditional sidebar entry (e.g. Light & Sun, Wearables, Cycle, EMF, Genetics).
// Appears only when the predicate yields data. Soft-promote via scroll-selector +
// optional expand callback; hard-promote via dedicated `navigate` target.
function _renderConditionalNavItem({ key, icon, label, navigate = 'dashboard', badge, scrollSelector, expandFn }) {
  let onclick;
  if (scrollSelector) {
    // Escape backslashes BEFORE quotes — otherwise a selector containing
    // a literal `\'` would survive as `\\'` (backslash + quote) and break
    // out of the JS string. CodeQL flags this even though scrollSelector
    // is a hardcoded module constant, never user input.
    const sel = scrollSelector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const expand = expandFn ? `;const b=el.querySelector('${expandFn.selector || '.collapsed'}');if(b&&b.classList.contains('hidden'))window.${expandFn.name}&&window.${expandFn.name}()` : '';
    onclick = `window.navigate('${navigate}');setTimeout(()=>{const el=document.querySelector('${sel}');if(el){const y=el.getBoundingClientRect().top+window.scrollY-60;window.scrollTo({top:y,behavior:'smooth'})${expand};}},100)`;
  } else if (navigate.startsWith('fn:')) {
    onclick = navigate.slice(3); // raw JS fragment
  } else {
    onclick = `window.navigate('${navigate}')`;
  }
  const badgeHtml = badge ? `<span class="nav-count">${escapeHTML(String(badge))}</span>` : '';
  return `<div class="nav-item" data-category="${key}" tabindex="0" role="button" onclick="${onclick}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
    <span class="icon">${icon}</span> ${escapeHTML(label)} ${badgeHtml}</div>`;
}

function _buildNavItem(key, cat) {
  const markers = Object.values(cat.markers).filter(m => !m.hidden);
  const withData = markers.filter(m => m.values && m.values.some(v => v !== null)).length;
  if (withData === 0) return null;
  const flagged = countFlagged(markers);
  const flagHtml = flagged > 0
    ? `<span class="flag-count">${flagged}</span>`
    : `<span class="count">${withData}</span>`;
  const markerNames = markers.map(m => m.name).join('|');
  // Strip redundant group prefix from label when shown under a group header
  let label = cat.label;
  if (cat.group && label.startsWith(cat.group + ': ')) {
    label = label.slice(cat.group.length + 2);
  }
  return { withData, flagged, html: `<div class="nav-item" data-category="${key}" data-markers="${escapeHTML(markerNames)}" data-group="${escapeHTML(cat.group || '')}" tabindex="0" role="button" onclick="window.navigate('${key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('${key}')}">
      <span class="icon">${cat.icon}</span> ${escapeHTML(label)} ${flagHtml}</div>` };
}

export function buildSidebar(data) {
  if (!data) data = getActiveData();
  data = filterDatesByRange(data);
  const nav = document.getElementById("sidebar-nav");
  let html = `<input type="text" class="sidebar-search" id="sidebar-search" placeholder="Search markers..." oninput="filterSidebar()">`;
  html += `<div class="nav-item active" data-category="dashboard" tabindex="0" role="button" onclick="window.navigate('dashboard')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('dashboard')}">
    <span class="icon">\uD83D\uDCCB</span> Dashboard</div>`;
  html += `<div class="nav-item" data-category="correlations" tabindex="0" role="button" onclick="window.navigate('correlations')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('correlations')}">
    <span class="icon">\uD83D\uDCC8</span> Correlations</div>`;
  html += `<div class="nav-item" data-category="compare" tabindex="0" role="button" onclick="window.navigate('compare')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('compare')}">
    <span class="icon">\u2194</span> Compare Dates</div>`;

  // \u2500\u2500\u2500 Conditional module entries \u2014 only render when the module has data.
  // Order: most-used first; new modules (Light & Sun) at the top to highlight discovery.
  // All except Light & Sun soft-promote (scroll + expand on dashboard); Light & Sun
  // hard-promotes to its dedicated view.

  // \u2600 Light & Sun \u2014 always visible (flagship module). New users
  // need a discoverable entry point even before logging anything; once
  // sessions exist, the badge shows this week's count.
  const sunSessions = state.importedData?.sunSessions || [];
  const weekStart = Date.now() - 7 * 86400 * 1000;
  const weekCount = sunSessions.filter(s => (s.endedAt || s.startedAt || 0) >= weekStart).length;
  html += _renderConditionalNavItem({
    key: 'light',
    icon: '\u2600', // monochrome glyph (no FE0F selector) \u2014 matches the rest of the sidebar (\uD83D\uDCCB \uD83C\uDF38 \uD83D\uDCE1 \uD83E\uDDEC)
    label: 'Light & Sun',
    navigate: 'light',
    badge: weekCount > 0 ? (weekCount > 9 ? '9+' : weekCount) : null,
  });

  // \u231A Wearables \u2014 soft-promote (scroll to wearable strip)
  const wearableConn = state.importedData?.wearableConnections || {};
  if (Object.keys(wearableConn).length > 0) {
    html += _renderConditionalNavItem({
      key: 'wearables',
      icon: '\u231A',
      label: 'Wearables',
      scrollSelector: '#wearable-strip',
    });
  }

  // \uD83D\uDC8A Supplements \u2014 soft-promote
  const supps = state.importedData?.supplements;
  if (Array.isArray(supps) && supps.length > 0) {
    html += _renderConditionalNavItem({
      key: 'supplements',
      icon: '\uD83D\uDC8A',
      label: 'Supplements',
      scrollSelector: '.supp-timeline-section',
      badge: supps.length,
    });
  }

  // \uD83C\uDF38 Cycle \u2014 female profiles with cycle data
  const sex = state.profileSex;
  const mc = state.importedData?.menstrualCycle;
  if (sex === 'female' && mc) {
    html += _renderConditionalNavItem({
      key: 'cycle',
      icon: '\uD83C\uDF38',
      label: 'Cycle',
      scrollSelector: '.cycle-section',
    });
  }

  // \uD83D\uDCE1 EMF \u2014 opens editor directly (no dedicated dashboard section)
  const emfAssessments = state.importedData?.emfAssessment?.assessments;
  if (Array.isArray(emfAssessments) && emfAssessments.length > 0) {
    html += _renderConditionalNavItem({
      key: 'emf',
      icon: '\uD83D\uDCE1',
      label: 'EMF',
      navigate: 'fn:window.openEMFAssessmentEditor&&window.openEMFAssessmentEditor()',
      badge: emfAssessments.length,
    });
  }

  // \uD83E\uDDEC Genetics \u2014 original conditional entry, refactored to use helper
  const genetics = state.importedData?.genetics;
  const hasGeneticsData = genetics && ((genetics.snps && Object.keys(genetics.snps).length > 0) || genetics.mtdna);
  if (hasGeneticsData) {
    const gParts = [];
    if (genetics.snps && Object.keys(genetics.snps).length > 0) gParts.push(Object.keys(genetics.snps).length);
    if (genetics.mtdna) gParts.push(genetics.mtdna.haplogroup);
    // Genetics has special expand-on-scroll behavior \u2014 keep its inline form
    html += `<div class="nav-item" data-category="genetics" tabindex="0" role="button" onclick="window.navigate('dashboard');setTimeout(()=>{const el=document.getElementById('genetics-section');if(el){const y=el.getBoundingClientRect().top+window.scrollY-60;window.scrollTo({top:y,behavior:'smooth'});const b=el.querySelector('.genetics-body');if(b&&b.classList.contains('hidden'))window.toggleGeneticsCollapse();}},100)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
      <span class="icon">\uD83E\uDDEC</span> Genetics <span class="nav-count">${gParts.join(' ')}</span></div>`;
  }

  // Separate categories into blood work (no group) and specialty groups
  const bloodWork = [];
  const specialtyGroups = {};
  for (const [key, cat] of Object.entries(data.categories)) {
    const item = _buildNavItem(key, cat);
    if (!item) continue;
    if (cat.group) {
      if (!specialtyGroups[cat.group]) specialtyGroups[cat.group] = { items: [], totalFlagged: 0 };
      specialtyGroups[cat.group].items.push(item);
      specialtyGroups[cat.group].totalFlagged += item.flagged;
    } else {
      bloodWork.push(item);
    }
  }

  // Render blood work categories
  html += `<div class="sidebar-title">Categories <button class="sidebar-add-marker" onclick="event.stopPropagation();openCreateMarkerModal()" title="Create custom biomarker">+</button></div>`;
  for (const item of bloodWork) html += item.html;

  // Render specialty groups
  for (const [groupName, group] of Object.entries(specialtyGroups)) {
    const collapsed = _getGroupCollapsed(groupName);
    const flagHtml = group.totalFlagged > 0
      ? `<span class="flag-count">${group.totalFlagged}</span>`
      : '';
    const aiOn = window.isGroupInAIContext && window.isGroupInAIContext(groupName);
    html += `<div class="sidebar-group-header${collapsed ? ' collapsed' : ''}" data-group-name="${escapeAttr(groupName)}" onclick="toggleNavGroup('${escapeAttr(groupName)}')" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleNavGroup('${escapeAttr(groupName)}')}">
      <span class="sidebar-group-label">${escapeHTML(groupName)}</span>
      ${flagHtml}
      <button class="sidebar-ai-toggle${aiOn ? ' active' : ''}" title="${aiOn ? 'Included in AI context' : 'Excluded from AI context — click to include'}" onclick="event.stopPropagation();toggleGroupAIContext('${escapeAttr(groupName)}')" aria-label="Toggle AI context for ${escapeHTML(groupName)}">AI</button>
      <span class="sidebar-group-arrow">\u25B8</span>
    </div>`;
    html += `<div class="sidebar-group-items" data-group-items="${escapeHTML(groupName)}"${collapsed ? ' style="display:none"' : ''}>`;
    for (const item of group.items) html += item.html;
    html += `</div>`;
  }

  nav.innerHTML = html;
}

function _getGroupCollapsed(groupName) {
  try { return localStorage.getItem(`labcharts-navgroup-${groupName}`) === 'collapsed'; } catch(e) { return false; }
}

export function toggleGroupAIContext(groupName) {
  const isOn = window.isGroupInAIContext && window.isGroupInAIContext(groupName);
  window.setGroupInAIContext(groupName, !isOn);
  const btn = document.querySelector(`.sidebar-group-header[data-group-name="${groupName}"] .sidebar-ai-toggle`);
  if (btn) {
    btn.classList.toggle('active', !isOn);
    btn.title = !isOn ? 'Included in AI context' : 'Excluded from AI context — click to include';
  }
}

export function toggleNavGroup(groupName) {
  const header = document.querySelector(`.sidebar-group-header[data-group-name="${groupName}"]`);
  const items = document.querySelector(`.sidebar-group-items[data-group-items="${groupName}"]`);
  if (!header || !items) return;
  const isCollapsed = header.classList.toggle('collapsed');
  items.style.display = isCollapsed ? 'none' : '';
  try { localStorage.setItem(`labcharts-navgroup-${groupName}`, isCollapsed ? 'collapsed' : 'expanded'); } catch(e) {}
}

export function filterSidebar() {
  const query = (document.getElementById('sidebar-search')?.value || '').toLowerCase().trim();
  const items = document.querySelectorAll('#sidebar-nav .nav-item');
  const titles = document.querySelectorAll('#sidebar-nav .sidebar-title');
  const groupHeaders = document.querySelectorAll('#sidebar-nav .sidebar-group-header');
  const groupItemContainers = document.querySelectorAll('#sidebar-nav .sidebar-group-items');
  if (!query) {
    items.forEach(el => el.style.display = '');
    titles.forEach(el => el.style.display = '');
    // Restore saved collapse state for groups
    groupHeaders.forEach(el => {
      const gn = el.dataset.groupName;
      const collapsed = _getGroupCollapsed(gn);
      el.style.display = '';
      el.classList.toggle('collapsed', collapsed);
    });
    groupItemContainers.forEach(el => {
      const gn = el.dataset.groupItems;
      el.style.display = _getGroupCollapsed(gn) ? 'none' : '';
    });
    return;
  }
  // When searching: show matching items, expand groups with matches, hide empty groups
  items.forEach(el => {
    const cat = el.dataset.category;
    if (cat === 'dashboard' || cat === 'correlations' || cat === 'compare' || cat === 'light' || cat === 'wearables' || cat === 'supplements' || cat === 'cycle' || cat === 'emf' || cat === 'genetics') { el.style.display = ''; return; }
    const label = el.textContent.toLowerCase();
    const markers = (el.dataset.markers || '').toLowerCase();
    el.style.display = (label.includes(query) || markers.includes(query)) ? '' : 'none';
  });
  titles.forEach(el => el.style.display = '');
  // Expand groups with matching items, hide groups with none
  groupItemContainers.forEach(el => {
    const gn = el.dataset.groupItems;
    const visibleItems = el.querySelectorAll('.nav-item:not([style*="display: none"])');
    const header = document.querySelector(`.sidebar-group-header[data-group-name="${gn}"]`);
    if (visibleItems.length > 0) {
      el.style.display = '';
      if (header) { header.style.display = ''; header.classList.remove('collapsed'); }
    } else {
      el.style.display = 'none';
      if (header) header.style.display = 'none';
    }
  });
}

// Avatar color palette — 10 distinct hues that work on dark & light
const AVATAR_COLORS = ['#4f8cff','#f472b6','#34d399','#fbbf24','#a78bfa','#f87171','#38bdf8','#fb923c','#22d3ee','#a3e635'];

export function getAvatarColor(id) {
  const h = parseInt(hashString(id || ''), 36);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function renderProfileButton() {
  const container = document.getElementById('profile-selector');
  if (!container) return;
  const profiles = getProfiles();
  const active = profiles.find(p => p.id === state.currentProfile) || profiles[0];
  if (!active) return;
  const dot = active.avatar
    ? `<img class="profile-compact-dot profile-compact-img" src="${escapeAttr(active.avatar)}" alt="">`
    : `<span class="profile-compact-dot" style="background:${getAvatarColor(active.id)}">${escapeHTML((active.name || '?')[0].toUpperCase())}</span>`;
  container.innerHTML = `<button class="profile-compact-btn" onclick="openClientList()" title="Manage clients">
    ${dot}
    <span class="profile-compact-name">${escapeHTML(active.name)}</span>
    <span class="profile-compact-arrow">\u25BC</span>
  </button>`;
}

// Keep renderProfileDropdown as alias for backward compat (tests, other modules)
export function renderProfileDropdown() { renderProfileButton(); }

// ═══════════════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════════════
export function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  const backdrop = document.getElementById('sidebar-backdrop');
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

export function closeMobileSidebar() {
  document.getElementById('sidebar-nav').classList.remove('mobile-open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
  document.body.style.overflow = '';
}

Object.assign(window, { buildSidebar, filterSidebar, toggleNavGroup, toggleGroupAIContext, renderProfileDropdown, renderProfileButton, getAvatarColor, toggleMobileSidebar, closeMobileSidebar });
