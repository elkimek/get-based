// tour.js — Generic spotlight tour engine + app tour + cycle tour

import { state } from './state.js';
import { profileStorageKey } from './profile.js';

const TOUR_STEPS = [
  { target: null, title: 'Welcome to getbased', text: 'Your personal blood work dashboard. Let\'s take a quick look around.', position: 'center' },
  { target: '#import-fab', title: 'Import More Labs', text: 'Click here to import another PDF lab report or JSON file. You can also drag and drop files anywhere on the page.', position: 'left' },
  { target: '.profile-compact-btn', title: 'Your Profile', text: 'Switch between profiles, manage clients, or load demo data. Click your name to open the client list.', position: 'bottom' },
  { target: '#sidebar-nav', title: 'Category Navigation', text: 'Browse marker categories \u2014 biochemistry, hormones, lipids, and more. On mobile use the hamburger menu.', position: 'right' },
  { target: '.chart-card .ctx-tips-badge', title: 'Tips', text: 'Markers with known interventions show actionable suggestions \u2014 free lifestyle changes, food sources, and supplements. Nature first, supplements last.', position: 'top' },
  { target: '.profile-context-cards', title: 'Lifestyle Context', text: 'Tell the AI about your diet, sleep, exercise, and more. The more you fill in, the better your insights.', position: 'bottom' },
  { target: '.settings-btn', title: 'Settings', text: 'Configure your profile, display preferences, and connect an AI provider.', position: 'bottom' },
  { target: '.feedback-btn', title: 'Send Feedback', text: 'Found a bug or have a feature idea? Report it here.', position: 'bottom' },
  { target: '#chat-fab', title: 'Ask AI', text: 'Chat with an AI analyst about your lab results. Requires an AI provider in Settings.', position: 'left' },
];

const CYCLE_TOUR_STEPS = [
  { target: null, title: 'Cycle-Aware Lab Interpretation', text: 'getbased tracks your menstrual cycle so AI can interpret hormones, iron, and inflammation in the right context. Here\u2019s what\u2019s available.', position: 'center' },
  { target: '.cycle-summary', title: 'Your Cycle at a Glance', text: 'Cycle length, regularity, flow, and contraceptive info \u2014 auto-calculated from your period log when possible.', position: 'bottom' },
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
  return localStorage.getItem(storageKey) === 'completed';
}

function runTour(steps, storageKey, auto) {
  if (auto && isTourCompleted(storageKey)) return;

  // Filter out steps whose target element is missing (except null/center steps)
  const filteredSteps = steps.filter(s => s.target === null || document.querySelector(s.target));
  if (filteredSteps.length === 0) return;

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
  const el = document.querySelector(step.target);
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

export function startTour(auto) {
  runTour(TOUR_STEPS, profileKey('tour'), auto);
}

export function startCycleTour(auto) {
  runTour(CYCLE_TOUR_STEPS, profileKey('cycleTour'), auto);
}

export function endTour() {
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
}

// Internal navigation helper exposed for onclick
window._tourGoToStep = goToStep;

Object.assign(window, { startTour, startCycleTour, endTour });
