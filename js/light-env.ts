import { renderHTML as renderEnvironmentSummaryHTML } from './components/LightEnvironmentSummary.svelte.html.js';
import { renderHTML as renderEnvironmentHTML } from './components/LightEnvironmentPresentation.svelte.html.js';
import { environmentRoomClasses } from './light-environment-room-classes.js';
import { projectRoomHeader, projectRoomPickers, projectRoomQuickPicks, projectRoomScreenContext, projectScreenQuickPicks, roomMeasurementTools, environmentReadingIcon, environmentText, formatEnvironmentMeasureValue, formatEnvironmentMeasureTime as fmtMeasureTime, type EnvironmentSectionView } from './light-environment-room-presentation.js';
import { projectEnvironmentToday } from './light-environment-screen-presentation.js';
// light-env.js — Light Environment module: rooms, screens, indoor light dose.
//
// Tracks continuous indoor light context alongside episodic Sun Sessions.
//
// Schema:
//   importedData.lightEnvironment = {
//     rooms: [{ name, primarySource, cct, hoursOccupiedPerDay,
//                eveningHoursAfterSunset, flickerScore, ... }],
//     screens: [{ device, hoursPerDay, eveningUseAfterSunset, ... }],
//   }

import type { EnvironmentRoomOperations, EnvironmentScreenReader, EnvironmentMeasurementOperations, EnvironmentAuditCollection, EnvironmentCalls, EnvironmentSeverityOptions, EnvironmentRefreshOptions } from '../types/light-env-view.js';
import { state } from './state.js';
import { bindModalSyncRefresh } from './utils.js';
import {
  getEnvironment,
  getScreensForRoom,
  isActiveToday,
} from './light-env-store.js';
import {
  computeRoomSeverityForRoom,
  computeDeficitAxesForEnvironment,
  computeIndoorBurdenForEnvironment,
} from './light-env-model.js';
import {
  configureLightEnvAudits,
  getLightAudits,
  lightEnvAuditActionHandlers,
  readLightAuditsView,
} from './light-env-audits.js';
import { installLightEnvActionDelegates } from './light-env-actions.js';
import {
  configureLightEnvEditor,
  isLightEnvScreenExpanded,
  lightEnvEditorActionHandlers,
  nextDefaultRoomName,
  resolveActiveRoomId,
  suggestRoomSourceFromSpectrum,
} from './light-env-editor.js';
import { readScreenCardView } from './light-env-screen-ui.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

export { getLightAudits, saveLightAudit, updateLightAudit, deleteLightAudit } from './light-env-audits.js';
export {
  addRoom,
  addScreen,
  deleteRoom,
  deleteScreen,
  getEnvironment,
  getScreensForRoom,
  isActiveToday,
  setTodayActive,
  updateRoom,
  updateScreen,
} from './light-env-store.js';
export {
  PRIMARY_SOURCES,
  DAYLIGHT_LEVELS,
  SCREEN_DEVICES,
  SOURCE_ARCHETYPES,
  HOURS_BUCKETS,
  EVENING_BUCKETS,
  activeSourceArchetype,
  activeHoursBucket,
  activeEveningBucket,
  defaultHoursForName,
  computeScreenStatus,
} from './light-env-model.js';
export {
  getRoomEveningHoursAfterSunset,
  hasRoomEveningAnswer,
  roomUsesEveningAfterSunset,
} from './light-env-evening.js';
export { nextDefaultRoomName, suggestRoomSourceFromSpectrum };

const lightEnvDeps: EnvironmentCalls = {
  getMeasurementsForRoom: null,
  navigate: null,
  getBurdenInterpretationView: null,
  getMeasurementAIView: null,
  getRoomAIView: null,
  getScreenAIView: null,
  openSpectrumClassifier: null,
  openLuxMeter: null,
  openFlickerDetector: null,
  openCCTMeter: null,
  openDarknessMeter: null,
};

export function configureLightEnv(deps: unknown = {}): Record<string, unknown> {
  const previous = { ...lightEnvDeps };
  for (const [key, value] of Object.entries((deps || {}) as object)) {
    if (Object.prototype.hasOwnProperty.call(lightEnvDeps, key)) {
      (lightEnvDeps as Record<string, unknown>)[key] = value;
    }
  }
  return previous;
}

// Environment-aware wrappers around the deterministic model. The model stays
// state-free; this module supplies today's skip toggles and room-linked screens.
export function computeRoomSeverity(room: unknown, measurements: unknown = [], options: EnvironmentSeverityOptions = {}) {
  return (computeRoomSeverityForRoom as (room: unknown, measurements: unknown, options: EnvironmentSeverityOptions) => ReturnType<typeof computeRoomSeverityForRoom>)(room, measurements, {
    screens: options.screens || ((room as { id?: unknown } | null | undefined)?.id ? getScreensForRoom((room as { id?: unknown }).id) : []),
    isActiveToday: options.isActiveToday || isActiveToday,
  });
}

export function computeDeficitAxes() {
  return (computeDeficitAxesForEnvironment as (env: unknown, options: { isActiveToday: typeof isActiveToday; getMeasurementsForRoom: typeof getMeasurementsFor }) => ReturnType<typeof computeDeficitAxesForEnvironment>)(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: getMeasurementsFor,
  });
}

export function computeIndoorBurden() {
  return (computeIndoorBurdenForEnvironment as (env: unknown, options: { isActiveToday: typeof isActiveToday; getMeasurementsForRoom: typeof getMeasurementsFor }) => ReturnType<typeof computeIndoorBurdenForEnvironment>)(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: getMeasurementsFor,
  });
}

// ─── UI: Light Environment page (lives at /light-environment route) ───
//
// Layout: disclosure list (collapsed-by-default cards with severity
// dots; expanding reveals a Step 1/2/3 form). Mirrors the EMF
// Assessment + Light Audits pattern so the three sub-modules share one
// mental model. First render auto-expands a useful room, but explicit
// user collapse is preserved.

function getMeasurementsFor(roomId: unknown) {
  if (typeof lightEnvDeps.getMeasurementsForRoom !== 'function') return [];
  try {
    const measurements = lightEnvDeps.getMeasurementsForRoom(roomId);
    return Array.isArray(measurements) ? measurements as EnvironmentMeasurementOperations[] : [];
  } catch (_) {
    return [];
  }
}

function readEnvironmentLoadSummary(): EnvironmentSectionView['load'] {
  const burden = computeIndoorBurden();
  // Live model grading remains authoritative even while cached AI copy is stale.
  const burdenView = typeof lightEnvDeps.getBurdenInterpretationView === 'function'
    ? lightEnvDeps.getBurdenInterpretationView(burden) ?? null : null;
  return {
    kind: 'load', color: burden.color ?? '', label: burden.label ?? '', parts: burden.parts,
    interp: burden.interp, burden: burdenView,
  };
}

function formatLatestLightAudit(audits: EnvironmentAuditCollection) {
  if (!audits.length) return 'No saved snapshots';
  const latest = audits
    .slice()
    .sort((a, b) => (b.createdAt || Date.parse(b.date || '') || 0) - (a.createdAt || Date.parse(a.date || '') || 0))[0];
  const label = latest?.label ? ` · ${latest.label}` : '';
  const date = latest?.date ? fmtMeasureTime(new Date(latest.date + 'T00:00:00').getTime()) : 'latest';
  return `${audits.length} audit${audits.length === 1 ? '' : 's'} · ${date}${label}`;
}

export function renderEnvironmentAssessmentSummary() {
  const env = getEnvironment();
  const rooms = (env?.rooms || []) as EnvironmentRoomOperations[];
  const screens = (env?.screens || []) as EnvironmentScreenReader[];
  const audits = getLightAudits() as EnvironmentAuditCollection;
  const measurements = (state.importedData?.lightMeasurements || []) as EnvironmentMeasurementOperations[];
  const roomIds = new Set(rooms.map(r => r.id).filter(Boolean));
  const mappedMeasurements = measurements.filter(m => m?.roomId && roomIds.has(m.roomId));
  const burden = computeIndoorBurden();
  const activeRooms = rooms.filter(isActiveToday as (item: EnvironmentRoomOperations) => unknown).length;
  const activeScreens = screens.filter(isActiveToday as (item: EnvironmentScreenReader) => unknown).length;
  const measuredRooms = new Set(mappedMeasurements.map(m => m.roomId)).size;
  const hasMapped = rooms.length > 0 || screens.length > 0;
  const hasRooms = rooms.length > 0;
  const actionLabel = hasMapped ? 'Open assessment' : 'Start assessment';
  const lead = hasMapped
    ? burden.interp
    : 'Map your bedroom, work areas, and screens once; update the assessment when bulbs, monitors, or evening routines change.';
  const metrics = [
    {
      label: 'Rooms',
      value: String(rooms.length),
      sub: rooms.length ? `${activeRooms} active today` : 'Start with bedroom',
    },
    {
      label: 'Screens',
      value: String(screens.length),
      sub: screens.length ? `${activeScreens} active today` : 'Portable or room-bound',
    },
  ];
  if (hasRooms) {
    metrics.push({
      label: 'Readings',
      value: String(mappedMeasurements.length),
      sub: measuredRooms ? `${measuredRooms} room${measuredRooms === 1 ? '' : 's'} checked` : 'Run brightness or banding',
    }, {
      label: 'Audits',
      value: String(audits.length),
      sub: formatLatestLightAudit(audits),
    });
  }
  return renderEnvironmentSummaryHTML({ view: {
    kind: 'assessment', color: burden.color ?? '', label: burden.label ?? '', parts: burden.parts,
    lead, actionLabel, hasRooms, metrics,
  } });
}

const LIGHT_ENV_ASSESSMENT_OVERLAY_ID = 'light-env-assessment-overlay';
const lightEnvironmentModalOwners = new WeakMap<HTMLElement, Pick<typeof state, 'currentProfile' | 'importedData'>>();

function getLightEnvironmentAssessmentOverlay() {
  return document.getElementById(LIGHT_ENV_ASSESSMENT_OVERLAY_ID);
}

function isLightEnvironmentAssessmentOpen() {
  return !!getLightEnvironmentAssessmentOverlay();
}

function renderLightEnvironmentAssessmentModal() {
  let overlay = getLightEnvironmentAssessmentOverlay();
  const wasOpen = overlay?.classList?.contains('show') === true;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = LIGHT_ENV_ASSESSMENT_OVERLAY_ID;
    overlay.className = environmentRoomClasses('modal-overlay light-env-assessment-overlay');
    overlay.dataset.lightEnvironmentShell = '';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightEnvironmentAssessment();
    });
    document.body.appendChild(overlay);
  }
  const origin = { currentProfile: state.currentProfile, importedData: state.importedData };
  const owner = lightEnvironmentModalOwners.get(overlay);
  const sameOwner = owner !== undefined && owner.currentProfile === origin.currentProfile && owner.importedData === origin.importedData;
  const active = document.activeElement;
  const identityAttributes = ['data-light-env-action', 'data-light-env-id', 'data-light-env-kind',
    'data-light-env-key', 'data-light-env-field', 'data-light-env-room-id', 'data-light-env-device',
    'data-light-env-name', 'data-light-env-tool', 'data-light-env-old-id', 'data-light-env-new-id'];
  const focused = wasOpen && sameOwner && active instanceof HTMLElement && overlay.contains(active)
    && active.matches('button, input, select, textarea') && active.hasAttribute('data-light-env-action')
    ? { element: active, tag: active.tagName, type: active.getAttribute('type'),
      identity: identityAttributes.map(name => [name, active.getAttribute(name)] as const),
      profile: state.currentProfile, data: state.importedData } : null;
  const selection = focused && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    && active.selectionStart !== null && active.selectionEnd !== null
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  const html = renderEnvironmentHTML({kind:'modal',view:readEnvironmentSection({embedded:true})});
  // A save can finish after the user focuses the next control. Preserve that
  // owned focus across replacement, without taking focus from another owner.
  const retainFocus = focused && document.activeElement === focused.element
    && state.currentProfile === focused.profile && state.importedData === focused.data;
  overlay.innerHTML = html;
  lightEnvironmentModalOwners.set(overlay, origin);
  if (focused && retainFocus && overlay.isConnected && getLightEnvironmentAssessmentOverlay() === overlay
    && overlay.classList.contains('show') && state.currentProfile === focused.profile
    && state.importedData === focused.data && (!document.activeElement || document.activeElement === document.body)) {
    const matches = Array.from(overlay.querySelectorAll('[data-light-env-action]')).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element.tagName === focused.tag
        && element.getAttribute('type') === focused.type
        && focused.identity.every(([name, value]) => element.getAttribute(name) === value));
    const target = matches.length === 1 ? matches[0] : null;
    if (target && !target.matches(':disabled, input[type="hidden"]') && !target.closest('[hidden], [inert]')) {
      target.focus({ preventScroll: true });
      if (selection && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        && target.selectionStart !== null && target.selectionEnd !== null) {
        try { target.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined); }
        catch { /* Unsupported text selection must not prevent native focus. */ }
      }
    }
  }
  if (!wasOpen) openModalOverlay(overlay, { initialFocus: '.modal-close', focusDelay: 50 });
}

export function openLightEnvironmentAssessment() {
  renderLightEnvironmentAssessmentModal();
}

export function closeLightEnvironmentAssessment() {
  const overlay = getLightEnvironmentAssessmentOverlay();
  if (!overlay) return;
  closeModalOverlay(overlay);
  lightEnvironmentModalOwners.delete(overlay);
  overlay.remove();
}

export function refreshLightEnvironmentAssessment() {
  if (isLightEnvironmentAssessmentOpen()) renderLightEnvironmentAssessmentModal();
}

function refreshOpenLightEnvironmentAssessmentOnSync() {
  renderLightEnvironmentAssessmentModal();
}

function setLightEnvironmentAssessmentScrollTop(scrollTop: number) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  if (!modal) return;
  const apply = () => { modal.scrollTop = Math.max(0, scrollTop || 0); };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}

function scrollLightEnvironmentAssessmentTo(selector: string, fallbackSelector = '') {
  const overlay = getLightEnvironmentAssessmentOverlay();
  const modal = overlay?.querySelector('.light-env-assessment-modal');
  const target = selector ? modal?.querySelector(selector) : null;
  const fallback = fallbackSelector ? modal?.querySelector(fallbackSelector) : null;
  const anchor = target || fallback;
  if (!modal || !anchor) return;
  // Layout retries must never move a control after the user starts another action.
  let interrupted = false;
  let lastAppliedTop = modal.scrollTop;
  const stop = () => { interrupted = true; };
  const interruptEvents = ['pointerdown', 'wheel', 'keydown'] as const;
  for (const type of interruptEvents) {
    modal.addEventListener(type, stop, { capture: true, once: true, passive: true });
  }
  const apply = () => {
    if (interrupted || modal.scrollTop !== lastAppliedTop || !modal.isConnected || !anchor.isConnected
        || getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal') !== modal) return;
    const modalRect = modal.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    modal.scrollTop = Math.max(0, modal.scrollTop + anchorRect.top - modalRect.top - 8);
    lastAppliedTop = modal.scrollTop;
  };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(() => {
    apply();
    for (const type of interruptEvents) modal.removeEventListener(type, stop, true);
  }, 60);
}

function refreshLightEnvironmentUI(options: EnvironmentRefreshOptions = {}) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  const priorScrollTop = modal?.scrollTop || 0;
  refreshLightEnvironmentAssessment();
  if (options.scrollAnchor) scrollLightEnvironmentAssessmentTo(options.scrollAnchor, options.fallbackScrollAnchor);
  else if (priorScrollTop) setLightEnvironmentAssessmentScrollTop(priorScrollTop);
  const navigate = lightEnvDeps.navigate;
  if (navigate && state.currentView === 'light') {
    navigate('light', options.scrollAnchor ? { scrollAnchor: options.scrollAnchor } : undefined);
  }
}

// Gather live state and configured renderer results once; authored children receive typed views.
function readLightEnvScreen(screen: EnvironmentScreenReader, rooms: unknown) {
  return readScreenCardView(screen, {expanded:isLightEnvScreenExpanded(screen.id),todayToggle:true,getScreenAIView:lightEnvDeps.getScreenAIView,rooms});
}
function readEnvironmentRoom(room:EnvironmentRoomOperations,expanded:boolean) {
  const measurements=getMeasurementsFor(room.id).sort((a,b)=>b.capturedAt-a.capturedAt);
  const severity=computeRoomSeverity(room,measurements);
  const active=(isActiveToday as (room:EnvironmentRoomOperations)=>boolean)(room);
  const view=projectRoomHeader(room,severity,expanded,active,projectEnvironmentToday('room',room.id,active));
  if(!expanded)return view;
  const latest=new Map<string,EnvironmentMeasurementOperations>();
  for(const measurement of measurements)if(!latest.has(measurement.tool))latest.set(measurement.tool,measurement);
  const today=projectEnvironmentToday('room',room.id,(isActiveToday as (room:EnvironmentRoomOperations)=>boolean)(room));
  const pickers=projectRoomPickers(room),tools=roomMeasurementTools(room.name||'');
  const readings=[...latest].map(([tool,measurement])=>({icon:environmentReadingIcon(tool),value:environmentText(formatEnvironmentMeasureValue(measurement)),time:fmtMeasureTime(measurement.capturedAt),
    ai:typeof lightEnvDeps.getMeasurementAIView==='function'?lightEnvDeps.getMeasurementAIView(measurement):null}));
  const roomAI=typeof lightEnvDeps.getRoomAIView==='function'?lightEnvDeps.getRoomAIView(room):null;
  const context=projectRoomScreenContext(room.name||''),screens=getScreensForRoom(room.id);
  const rooms=(getEnvironment()?.rooms||[]) as EnvironmentRoomOperations[];
  return {...view,today,body:{pickers,tools,readings,ai:roomAI,screenHeading:context.screenHeading,screenEmpty:context.screenEmpty,
    screens:screens.map(screen=>readLightEnvScreen(screen,rooms)),quickPicks:projectScreenQuickPicks(screens,room.id,context.preferred)}};
}
function readEnvironmentSection(options:{embedded?:unknown}={}):EnvironmentSectionView {
  const env=getEnvironment(),rooms=(env?.rooms||[]) as EnvironmentRoomOperations[],screens=(env?.screens||[]) as EnvironmentScreenReader[];
  const load=readEnvironmentLoadSummary(),activeId=rooms.length?resolveActiveRoomId(rooms):null;
  const roomViews=rooms.map(room=>readEnvironmentRoom(room,room.id===activeId));
  const roomQuickPicks=projectRoomQuickPicks(rooms),portable=screens.filter(screen=>!screen.roomId);
  const portableViews=portable.map(screen=>readLightEnvScreen(screen,rooms));
  // Audit callbacks stay last, matching the existing room/screen rendering order.
  const audits=rooms.length?readLightAuditsView():null;
  return {embedded:!!options.embedded,load,rooms:roomViews,roomQuickPicks,portable:portableViews,
    portableQuickPicks:projectScreenQuickPicks(portable),empty:!rooms.length&&!screens.length,audits};
}
export function renderEnvironmentSection(options:{embedded?:unknown}={}) {
  return renderEnvironmentHTML({kind:'section',view:readEnvironmentSection(options)});
}

export function getRooms(): unknown {
  return (getEnvironment()?.rooms) || [];
}

function openLightEnvTool(tool: unknown, roomId: unknown) {
  const opts = roomId ? { roomId } : undefined;
  const openers = {
    spectrum: lightEnvDeps.openSpectrumClassifier,
    lux: lightEnvDeps.openLuxMeter,
    flicker: lightEnvDeps.openFlickerDetector,
    cct: lightEnvDeps.openCCTMeter,
    darkness: lightEnvDeps.openDarknessMeter,
  };
  const opener = (openers as Record<string, unknown>)[tool as string];
  if (typeof opener === 'function') (opener as (options: unknown) => unknown)(opts);
}

export const lightEnvActionHandlers = Object.freeze({
  ...lightEnvEditorActionHandlers,
  openLightEnvironmentAssessment,
  closeLightEnvironmentAssessment,
  openLightEnvTool,
});

configureLightEnvEditor({
  refreshUI: refreshLightEnvironmentUI,
});
configureLightEnvAudits({
  getEnvironment,
  computeRoomSeverity,
  refreshLightEnvironmentUI,
});

if (typeof document !== 'undefined') {
  installLightEnvActionDelegates({
    ...lightEnvActionHandlers,
    ...lightEnvAuditActionHandlers,
  });
}

if (typeof window !== 'undefined') {
  bindModalSyncRefresh({
    overlayId: LIGHT_ENV_ASSESSMENT_OVERLAY_ID,
    modalSelector: '.light-env-assessment-modal',
    refresh: refreshOpenLightEnvironmentAssessmentOnSync,
  });
}
