// tour.js — Generic spotlight tour engine + app tours + cycle tour

import { state } from './state.js';
import { profileStorageKey } from './profile.js';

const EMPTY_TOUR_STEPS = [
  { target: null, title: 'Welcome to getbased', text: 'This quick tour is for a fresh profile. After the tour, guided chat will help you decide what to add first.', position: 'center' },
  { target: '.welcome-primary-panel', title: 'Start Guided Chat', text: 'Chat is the main path for new profiles. It asks for context only when useful and routes you to import or setup when needed.', position: 'bottom' },
  { target: '.demo-cards', title: 'Try a Populated Profile', text: 'Demo profiles show the full dashboard without adding your own data.', position: 'top' },
  { target: '.profile-compact-btn', title: 'Profiles Stay Separate', text: 'Switch or manage profiles here. Each profile keeps its own data, settings, and tour progress.', position: 'bottom' },
  { target: '.settings-btn', title: 'Settings & Connections', text: 'Configure privacy, AI providers, wearables, sync, and data controls here.', position: 'bottom' },
];

const TOUR_STEPS = [
  { target: null, title: 'Welcome to getbased', text: 'Health intelligence that\'s actually yours \u2014 five lenses on your biology, one private dashboard. Let\'s take a quick look around.', position: 'center' },
  { target: '.header-import-btn, #drop-zone', title: 'Import Health Data', text: 'Import lab PDFs, report photos, DNA raw data, or getbased JSON. You can also drop files directly onto the page.', position: 'bottom' },
  { target: '.profile-compact-btn', title: 'Profiles & Demo Data', text: 'Switch profiles, manage clients, or load demo data from here. Each profile keeps its own data, settings, and tour progress.', position: 'bottom' },
  { target: '.nav-item[data-category="labs"], #sidebar-toggle, .m-tabbar', title: 'Five Lenses', text: 'Move between Dashboard, Labs, Genome, Body, Light, Insight, and Recommendations. Desktop uses the sidebar; smaller screens use tabs and the menu.', position: 'right' },
  { target: '.dashboard-greeting', title: 'Dashboard Overview', text: 'The dashboard summarizes the current profile. After import, widgets surface focus areas, priorities, recommendations, body data, and light context.', position: 'bottom' },
  { target: '.dashboard-sticky-actions', title: 'Customize Widgets', text: 'Use Customize and Add widget to choose the sections that matter for this profile.', position: 'bottom' },
  { target: '.tweaks-btn', title: 'Display Tweaks', text: 'Adjust theme, accent color, density, and motion effects without leaving the current screen.', position: 'bottom' },
  { target: '.settings-btn', title: 'Settings & Connections', text: 'Configure demographics, privacy, AI providers, wearables, sync, and data controls here.', position: 'bottom' },
  { target: '#chat-fab, .m-chat-fab, #chat-panel.open', title: 'Ask AI', text: 'Use chat for guided interpretation, import setup, and follow-up questions. It uses the current profile context when an AI provider is connected.', position: 'left' },
];

const CYCLE_TOUR_STEPS = [
  { target: null, title: 'Cycle-Aware Lab Interpretation', text: 'getbased tracks your menstrual cycle so AI can interpret hormones, iron, and inflammation in the right context. Here\u2019s what\u2019s available.', position: 'center' },
  { target: '.cycle-summary-card', title: 'Your Cycle at a Glance', text: 'Cycle length, regularity, flow, and contraceptive info \u2014 auto-calculated from your period log when possible.', position: 'bottom' },
  { target: '.cycle-draw-date', title: 'Optimal Blood Draw Timing', text: 'Get recommendations for when to schedule blood work \u2014 early follicular phase (days 3\u20135) gives the most stable baseline.', position: 'bottom' },
  { target: '.cycle-draw-phases', title: 'Phase Labels on Lab Dates', text: 'Each lab date is tagged with its cycle phase so you can see how timing may have affected your results.', position: 'bottom' },
  { target: '.cycle-period-log', title: 'Period Log & Symptoms', text: 'Log each period with flow, symptoms, and notes. More entries = better auto-calculated stats and smarter alerts.', position: 'bottom' },
  { target: '.cycle-alert', title: 'Smart Alerts', text: 'Perimenopause pattern detection and heavy-flow iron alerts \u2014 cross-referencing your cycle with your lab results.', position: 'bottom' },
  { target: '.chart-layers-wrapper', title: 'Phase Bands on Charts', text: 'Toggle cycle phase bands in the Layers dropdown to see menstrual, follicular, ovulatory, and luteal shading on your charts.', position: 'bottom' },
  { target: '#chat-fab', title: 'AI Knows Your Cycle', text: 'The AI chat factors in your cycle phase when interpreting every marker \u2014 ask it about any result for phase-aware insights.', position: 'left' },
];

// Active tour state
let activeTour = null;

function profileKey(suffix) {
  return profileStorageKey(state.currentProfile, suffix);
}

function isTourCompleted(storageKey) {
  const stored = localStorage.getItem(storageKey);
  if (stored === 'completed') return true;
  // Older encrypted installs could leave UI-only tour flags as ciphertext.
  // Tour keys only ever persist the completed marker, so normalize the
  // legacy wrapper instead of reopening the walkthrough after encryption is
  // disabled.
  if (typeof stored === 'string' && stored.startsWith('v1:')) {
    try { localStorage.setItem(storageKey, 'completed'); } catch (_) {}
    return true;
  }
  return false;
}

function _isActiveProfileDemo() {
  try {
    const profiles = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]');
    const activeId = localStorage.getItem('labcharts-active-profile');
    const active = profiles.find(p => p.id === activeId);
    return Array.isArray(active?.tags) && active.tags.includes('demo');
  } catch (_) { return false; }
}

function isTourTargetVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0';
}

function getTourTargetElement(target) {
  if (!target) return null;
  try {
    return Array.from(document.querySelectorAll(target)).find(isTourTargetVisible) || null;
  } catch (_) {
    return null;
  }
}

function runTour(steps, storageKey, auto) {
  if (auto && isTourCompleted(storageKey)) return false;
  // Demo profiles are exploration sandboxes — re-firing the welcome
  // tour every time the user picks a different demo is noise. Manual
  // tour invocation (auto=false) still works on demo profiles.
  if (auto && _isActiveProfileDemo()) return false;

  // Filter out steps whose target element is missing or hidden (except null/center steps).
  const filteredSteps = steps.filter(s => s.target === null || getTourTargetElement(s.target));
  if (filteredSteps.length === 0) return false;

  activeTour = { steps: filteredSteps, storageKey, currentStep: 0 };

  // Create overlay elements if not already in DOM
  if (!document.getElementById('tour-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) endTour();
    });
    document.body.appendChild(overlay);

    const spotlight = document.createElement('div');
    spotlight.id = 'tour-spotlight';
    document.body.appendChild(spotlight);

    const tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'true');
    tooltip.setAttribute('aria-labelledby', 'tour-tooltip-heading');
    document.body.appendChild(tooltip);
  }

  document.getElementById('tour-overlay').style.display = 'block';
  document.getElementById('tour-spotlight').style.display = 'block';
  document.getElementById('tour-tooltip').style.display = 'block';

  goToStep(0);
  return true;
}

function goToStep(index) {
  if (!activeTour) return;
  activeTour.currentStep = index;
  const steps = activeTour.steps;
  const step = steps[index];
  const spotlight = document.getElementById('tour-spotlight');
  const tooltip = document.getElementById('tour-tooltip');
  if (!spotlight || !tooltip) return;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // Build tooltip content
  let dotsHtml = '<div class="tour-dots">';
  for (let i = 0; i < steps.length; i++) {
    dotsHtml += `<div class="tour-dot${i === index ? ' active' : ''}"></div>`;
  }
  dotsHtml += '</div>';

  const backBtn = isFirst
    ? `<button class="tour-btn tour-btn-secondary" onclick="endTour()">Skip</button>`
    : `<button class="tour-btn tour-btn-secondary" onclick="window._tourGoToStep(${index - 1})">Back</button>`;
  const nextBtn = isLast
    ? `<button class="tour-btn tour-btn-primary" onclick="endTour()">Done</button>`
    : `<button class="tour-btn tour-btn-primary" onclick="window._tourGoToStep(${index + 1})">Next</button>`;

  tooltip.innerHTML = `<h4 id="tour-tooltip-heading">${step.title}</h4><p>${step.text}</p>
    <div class="tour-nav">${dotsHtml}<div class="tour-btns">${backBtn}${nextBtn}</div></div>`;

  if (step.target === null) {
    // Welcome step — no spotlight, center tooltip
    spotlight.style.display = 'none';
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  // Find target element
  const el = getTourTargetElement(step.target);
  if (!el) {
    // Target not found — skip to next or end
    if (!isLast) goToStep(index + 1);
    else endTour();
    return;
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Position after scroll settles
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const pad = 8;

    // Position spotlight
    spotlight.style.display = 'block';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    // Position tooltip
    tooltip.style.transform = 'none';
    positionTooltip(rect, step.position);
  });
}

function positionTooltip(rect, position) {
  const tooltip = document.getElementById('tour-tooltip');
  if (!tooltip) return;
  const gap = 12;
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Temporarily make tooltip visible to measure it
  tooltip.style.left = '0';
  tooltip.style.top = '0';
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  let left, top;
  const spotLeft = rect.left - pad;
  const spotTop = rect.top - pad;
  const spotRight = rect.right + pad;
  const spotBottom = rect.bottom + pad;

  if (position === 'bottom' && spotBottom + gap + th <= vh) {
    top = spotBottom + gap;
    left = spotLeft + (rect.width + pad * 2 - tw) / 2;
  } else if (position === 'right' && spotRight + gap + tw <= vw) {
    left = spotRight + gap;
    top = spotTop + (rect.height + pad * 2 - th) / 2;
  } else if (position === 'left' && spotLeft - gap - tw >= 0) {
    left = spotLeft - gap - tw;
    top = spotTop + (rect.height + pad * 2 - th) / 2;
  } else if (position === 'top' && spotTop - gap - th >= 0) {
    top = spotTop - gap - th;
    left = spotLeft + (rect.width + pad * 2 - tw) / 2;
  } else {
    // Fallback: place below
    top = spotBottom + gap;
    left = spotLeft + (rect.width + pad * 2 - tw) / 2;
    // If still doesn't fit below, place above
    if (top + th > vh) top = spotTop - gap - th;
  }

  // Clamp within viewport
  left = Math.max(12, Math.min(left, vw - tw - 12));
  top = Math.max(12, Math.min(top, vh - th - 12));

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

export function startEmptyTour(auto) {
  return runTour(EMPTY_TOUR_STEPS, profileKey('emptyTour'), auto);
}

export function startTour(auto) {
  return runTour(TOUR_STEPS, profileKey('tour'), auto);
}

export function startGuidedTour(auto) {
  return getTourTargetElement('.welcome-primary-panel')
    ? startEmptyTour(auto)
    : startTour(auto);
}

export function startCycleTour(auto) {
  return runTour(CYCLE_TOUR_STEPS, profileKey('cycleTour'), auto);
}

export function endTour() {
  const shouldOpenEmptyChat = activeTour?.storageKey === profileKey('emptyTour') &&
    !state.importedData?.entries?.length &&
    state.chatHistory.length === 0;
  if (activeTour) {
    localStorage.setItem(activeTour.storageKey, 'completed');
  }
  activeTour = null;
  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  const tooltip = document.getElementById('tour-tooltip');
  if (overlay) overlay.remove();
  if (spotlight) spotlight.remove();
  if (tooltip) tooltip.remove();
  if (shouldOpenEmptyChat) {
    setTimeout(() => {
      const panel = document.getElementById('chat-panel');
      if (!panel?.classList.contains('open')) window.openChatPanel?.();
    }, 250);
  }
}

// Internal navigation helper exposed for onclick
window._tourGoToStep = goToStep;

Object.assign(window, { startEmptyTour, startTour, startGuidedTour, startCycleTour, endTour });
