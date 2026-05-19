// nav.js — Sidebar, compact profile button

import { state } from './state.js';
import { escapeHTML, escapeAttr, hashString } from './utils.js';
import { getActiveData, countFlagged, filterDatesByRange } from './data.js';
import { getProfiles } from './profile.js';

function _iconSvg(name) {
  const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    search: `<svg ${attrs}><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.35-4.35"></path></svg>`,
    dashboard: `<svg ${attrs}><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>`,
    labs: `<svg ${attrs}><path d="M12 2.7s5 6.3 5 11.3a5 5 0 0 1-10 0c0-5 5-11.3 5-11.3z"></path></svg>`,
    genome: `<svg ${attrs}><path d="M4 4c4 3 12 3 16 0"></path><path d="M4 8c4 3 12 3 16 0"></path><path d="M4 12c4 3 12 3 16 0"></path><path d="M4 16c4 3 12 3 16 0"></path><path d="M4 20c4 3 12 3 16 0"></path></svg>`,
    body: `<svg ${attrs}><circle cx="12" cy="12" r="6"></circle><path d="M12 9v3l1.5 1.5"></path><path d="M16 4l-2 2"></path><path d="M8 4l2 2"></path><path d="M16 20l-2-2"></path><path d="M8 20l2-2"></path></svg>`,
    light: `<svg ${attrs}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M4.93 19.07l1.41-1.41"></path><path d="M17.66 6.34l1.41-1.41"></path></svg>`,
    insight: `<svg ${attrs}><path d="M9.5 3a3.5 3.5 0 0 0-3 5.3"></path><path d="M14.5 3a3.5 3.5 0 0 1 3 5.3"></path><path d="M6.5 8.3A4 4 0 0 0 4 12c0 1.7.7 3.2 1.8 4.3"></path><path d="M17.5 8.3A4 4 0 0 1 20 12c0 1.7-.7 3.2-1.8 4.3"></path><path d="M9 21a2 2 0 0 1-2-2v-2"></path><path d="M15 21a2 2 0 0 0 2-2v-2"></path><path d="M12 6v15"></path></svg>`,
    compare: `<svg ${attrs}><path d="M17 3l4 4-4 4"></path><path d="M3 7h18"></path><path d="M7 21l-4-4 4-4"></path><path d="M21 17H3"></path></svg>`,
    correlations: `<svg ${attrs}><path d="M3 17c3.5-8 7-8 10.5 0s7 8 10.5 0"></path></svg>`,
    recommendations: `<svg ${attrs}><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="M4.93 19.07l2.83-2.83"></path><path d="M16.24 7.76l2.83-2.83"></path></svg>`,
    knowledge: `<svg ${attrs}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`,
    plus: `<svg ${attrs}><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`,
    emf: `<svg ${attrs}><path d="M5 12.5a7 7 0 0 1 14 0"></path><path d="M8 12.5a4 4 0 0 1 8 0"></path><path d="M12 12.5v.01"></path><path d="M12 17v4"></path></svg>`,
  };
  return icons[name] || escapeHTML(String(name || ''));
}

// Render a compact sidebar entry for modules whose visibility depends on data.
function _renderConditionalNavItem({ key, icon, label, navigate = 'dashboard', badge }) {
  let onclick;
  if (navigate.startsWith('fn:')) {
    onclick = navigate.slice(3); // raw JS fragment
  } else {
    onclick = `window.navigate('${navigate}')`;
  }
  const badgeHtml = badge ? `<span class="nav-item-count nav-count">${escapeHTML(String(badge))}</span>` : '<span class="nav-item-dot"></span>';
  return `<div class="nav-item" data-category="${key}" tabindex="0" role="button" onclick="${onclick}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg(icon)}</span>
    <span class="nav-item-label">${escapeHTML(label)}</span>
    ${badgeHtml}</div>`;
}

export function openRecommendationsFromSidebar() {
  if (window.navigate) window.navigate('recommendations');
}

export function syncSidebarActive(route = state.currentView || 'dashboard') {
  const activeRoute = String(route || 'dashboard');
  document.querySelectorAll('#sidebar-nav .nav-item').forEach(el => {
    const isActive = el.dataset.category === activeRoute;
    el.classList.toggle('active', isActive);
    el.classList.toggle('is-active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function _buildNavItem(key, cat) {
  const markers = Object.values(cat.markers).filter(m => !m.hidden);
  const withData = markers.filter(m => m.values && m.values.some(v => v !== null)).length;
  if (withData === 0) return null;
  const flagged = countFlagged(markers);
  const flagHtml = flagged > 0
    ? `<span class="nav-item-count flag-count">${flagged}</span>`
    : `<span class="nav-item-count count">${withData}</span>`;
  const markerNames = markers.map(m => m.name).join('|');
  // Strip redundant group prefix from label when shown under a group header
  let label = cat.label;
  if (cat.group && label.startsWith(cat.group + ': ')) {
    label = label.slice(cat.group.length + 2);
  }
  return { withData, flagged, html: `<div class="nav-item" data-category="${key}" data-markers="${escapeHTML(markerNames)}" data-group="${escapeHTML(cat.group || '')}" tabindex="0" role="button" onclick="window.navigate('${key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('${key}')}">
      <span class="nav-item-dot" aria-hidden="true"></span>
      <span class="nav-item-label">${escapeHTML(label)}</span>
      ${flagHtml}</div>` };
}

export function buildSidebar(data) {
  if (!data) data = getActiveData();
  data = filterDatesByRange(data);
  const nav = document.getElementById("sidebar-nav");
  const counts = (() => {
    let markerCount = 0;
    for (const cat of Object.values(data.categories || {})) {
      for (const marker of Object.values(cat.markers || {})) {
        if (!marker.hidden && marker.values?.some(v => v !== null)) markerCount++;
      }
    }
    return markerCount;
  })();
  let html = `<div class="sidebar-search-wrap">
    <span class="sidebar-search-icon" aria-hidden="true">${_iconSvg('search')}</span>
    <input type="text" class="sidebar-search" id="sidebar-search" placeholder="Search markers..." oninput="filterSidebar()">
  </div>`;
  html += `<div class="nav-section">Home</div>`;
  html += `<div class="nav-item active is-active" data-category="dashboard" tabindex="0" role="button" onclick="window.navigate('dashboard')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('dashboard')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('dashboard')}</span>
    <span class="nav-item-label">Dashboard</span>
    <span class="nav-item-count">${counts}</span></div>`;
  html += `<div class="nav-section">Lenses</div>`;
  html += `<div class="nav-item" data-category="labs" tabindex="0" role="button" onclick="window.navigate('labs')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('labs')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('labs')}</span>
    <span class="nav-item-label">Labs</span>
    <span class="nav-item-count">${counts}</span></div>`;

  // Lens entries route to dedicated views; compact summary widgets remain
  // available on the dashboard.

  const genetics = state.importedData?.genetics;
  const hasGeneticsData = genetics && ((genetics.snps && Object.keys(genetics.snps).length > 0) || genetics.mtdna);
  const gParts = [];
  if (hasGeneticsData) {
    if (genetics.snps && Object.keys(genetics.snps).length > 0) gParts.push(Object.keys(genetics.snps).length);
    if (genetics.mtdna) gParts.push(genetics.mtdna.haplogroup);
  }
  html += `<div class="nav-item" data-category="genome" tabindex="0" role="button" onclick="window.navigate('genome')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('genome')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('genome')}</span>
    <span class="nav-item-label">Genome</span>
    ${gParts.length ? `<span class="nav-item-count">${escapeHTML(gParts.join(' '))}</span>` : '<span class="nav-item-dot"></span>'}</div>`;

  const wearableConn = state.importedData?.wearableConnections || {};
  const wearableCount = Object.keys(wearableConn).length;
  html += `<div class="nav-item" data-category="body" tabindex="0" role="button" onclick="window.navigate('body')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('body')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('body')}</span>
    <span class="nav-item-label">Body</span>
    ${wearableCount ? `<span class="nav-item-count">${wearableCount}</span>` : '<span class="nav-item-dot"></span>'}</div>`;

  // \u2600 Light & Sun \u2014 always visible (flagship module). New users
  // need a discoverable entry point even before logging anything; once
  // sessions exist, the badge shows this week's count.
  const sunSessions = state.importedData?.sunSessions || [];
  const weekStart = Date.now() - 7 * 86400 * 1000;
  const weekCount = sunSessions.filter(s => (s.endedAt || s.startedAt || 0) >= weekStart).length;
  html += _renderConditionalNavItem({
    key: 'light',
    icon: 'light',
    label: 'Light',
    navigate: 'light',
    badge: weekCount > 0 ? (weekCount > 9 ? '9+' : weekCount) : null,
  });

  html += `<div class="nav-item" data-category="insight" tabindex="0" role="button" onclick="window.navigate('insight')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('insight')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('insight')}</span>
    <span class="nav-item-label">Insight</span>
    <span class="nav-item-dot"></span></div>`;
  html += `<div class="nav-item" data-category="recommendations" tabindex="0" role="button" onclick="window.navigate('recommendations')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('recommendations')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('recommendations')}</span><span class="nav-item-label">Recommendations</span><span class="nav-item-dot"></span></div>`;

  html += `<div class="nav-section">Analysis tools</div>`;
  html += `<div class="nav-item" data-category="compare" tabindex="0" role="button" onclick="window.navigate('compare')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('compare')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('compare')}</span><span class="nav-item-label">Compare dates</span><span class="nav-item-dot"></span></div>`;
  html += `<div class="nav-item" data-category="correlations" tabindex="0" role="button" onclick="window.navigate('correlations')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.navigate('correlations')}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('correlations')}</span><span class="nav-item-label">Correlations</span><span class="nav-item-dot"></span></div>`;

  html += `<div class="nav-section">Manage</div>`;
  html += `<div class="nav-item" data-category="knowledge" tabindex="0" role="button" onclick="window.openKnowledgeBaseModal&&window.openKnowledgeBaseModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('knowledge')}</span><span class="nav-item-label">Knowledge Base</span><span class="nav-item-dot"></span></div>`;
  html += `<div class="nav-item" data-category="custom-markers" tabindex="0" role="button" onclick="window.openCreateMarkerModal&&window.openCreateMarkerModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
    <span class="nav-item-icon" aria-hidden="true">${_iconSvg('plus')}</span><span class="nav-item-label">Custom markers</span><span class="nav-item-dot"></span></div>`;

  // \uD83D\uDCE1 EMF \u2014 opens editor directly (no dedicated dashboard section)
  const emfAssessments = state.importedData?.emfAssessment?.assessments;
  if (Array.isArray(emfAssessments) && emfAssessments.length > 0) {
    html += _renderConditionalNavItem({
      key: 'emf',
      icon: 'emf',
      label: 'EMF',
      navigate: 'fn:window.openEMFAssessmentEditor&&window.openEMFAssessmentEditor()',
      badge: emfAssessments.length,
    });
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

  // Lab category shortcuts stay in the sidebar because they are the fastest
  // way to jump into a biomarker table, but the Labs lens itself is the
  // all-biomarker entry point.
  html += `<div class="nav-section sidebar-title">Lab categories <button class="sidebar-add-marker" onclick="event.stopPropagation();openCreateMarkerModal()" title="Create custom biomarker">+</button></div>`;
  for (const item of bloodWork) html += item.html;

  // Render specialty groups
  for (const [groupName, group] of Object.entries(specialtyGroups)) {
    const collapsed = _getGroupCollapsed(groupName);
    const flagHtml = group.totalFlagged > 0
      ? `<span class="flag-count">${group.totalFlagged}</span>`
      : '';
    const aiOn = window.isGroupInAIContext && window.isGroupInAIContext(groupName);
    // axe nested-interactive: the AI toggle button cannot live inside an
    // interactive parent. Disclosure is now its own <button>; AI toggle
    // is a sibling, not a descendant. Arrow is also a sibling (decorative
    // span, aria-hidden) AFTER the AI toggle — restores the original
    // [label flag] [AI] [arrow] visual order. Sighted users still see
    // the rotation cue; keyboard users use the toggle button.
    html += `<div class="sidebar-group-header${collapsed ? ' collapsed' : ''}" data-group-name="${escapeAttr(groupName)}" onclick="toggleNavGroup('${escapeAttr(groupName)}')">
      <button class="sidebar-group-toggle" onclick="event.stopPropagation();toggleNavGroup('${escapeAttr(groupName)}')" aria-expanded="${!collapsed}" aria-label="${escapeAttr(groupName)} group">
        <span class="sidebar-group-label">${escapeHTML(groupName)}</span>
        ${flagHtml}
      </button>
      <button class="sidebar-ai-toggle${aiOn ? ' active' : ''}" title="${aiOn ? 'Included in AI context' : 'Excluded from AI context — click to include'}" onclick="event.stopPropagation();toggleGroupAIContext('${escapeAttr(groupName)}')" aria-label="Toggle AI context for ${escapeHTML(groupName)}">AI</button>
      <span class="sidebar-group-arrow" aria-hidden="true">\u25B8</span>
    </div>`;
    html += `<div class="sidebar-group-items" data-group-items="${escapeHTML(groupName)}"${collapsed ? ' style="display:none"' : ''}>`;
    for (const item of group.items) html += item.html;
    html += `</div>`;
  }

  nav.innerHTML = html;
  syncSidebarActive(state.currentView || 'dashboard');
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
  // Keep aria-expanded in sync with the visual state. Without this, the
  // attribute captured at render time goes stale on every toggle and screen
  // readers announce a wrong expansion state until the next full re-render.
  const toggleBtn = header.querySelector('.sidebar-group-toggle');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
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
    if (cat === 'dashboard' || cat === 'labs' || cat === 'correlations' || cat === 'compare' || cat === 'recommendations' || cat === 'knowledge' || cat === 'custom-markers' || cat === 'light' || cat === 'body' || cat === 'wearables' || cat === 'emf' || cat === 'genome' || cat === 'genetics' || cat === 'insight') { el.style.display = ''; return; }
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

Object.assign(window, { buildSidebar, filterSidebar, toggleNavGroup, toggleGroupAIContext, renderProfileDropdown, renderProfileButton, getAvatarColor, syncSidebarActive, toggleMobileSidebar, closeMobileSidebar, openRecommendationsFromSidebar });
