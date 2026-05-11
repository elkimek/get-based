// ai-verdict-engine.js — shared analyze-state engine for the per-row /
// per-day AI verdicts surfaced across the Light & Sun feature (sun
// sessions, light-therapy device sessions, tool measurements, room
// audits, daily hero, onboarding).
//
// Each consumer module supplies a small config; the engine owns:
//   • the in-memory in-flight tracker (analyzing state never persists)
//   • the 60s API watchdog (cold-model-load / wedged-relay safety net)
//   • the fingerprint cache check (skip API when target is unchanged)
//   • parse + validate of the dot/tip/detail JSON contract
//   • write-then-push to keep cross-device sync sub-10s
//   • the orphaned-analyzing-state purge for legacy rows from pre-fix runs
//
// Per-feature modules keep:
//   • the context builder (what to actually feed the model)
//   • the system prompt (how the model should reason about that data)
//   • the render functions (idle CTA / shimmer / verdict / error UI is
//     similar but each consumer slots into different parent containers)

import { hasAIProvider, callClaudeAPI } from './api.js';
import { saveImportedData } from './data.js';
import { pushCurrentProfile, isSyncEnabled } from './sync.js';

// Cross-device LWW behaviour (load-bearing for anyone debugging "verdict
// mismatch on phone vs desktop"):
//
// When two devices analyze the same target concurrently (e.g. desktop
// auto-fires the daily hero on first visit at 09:00:00, phone hits ↻
// at 09:00:01), both writes sync via the per-row CRDT. The relay
// resolves with last-write-wins on `syncedAt` — whichever push lands
// later overwrites the other. The "loser" verdict is silently dropped
// on the next pull.
//
// This is acceptable because: (a) verdicts are deterministic-ish (same
// data → similar verdict, modulo LLM phrasing variance), (b) the user
// owns both devices, so winning-vs-losing arbitrarily is fine, (c)
// the fingerprint cache prevents most concurrent re-analyses anyway —
// only a force-refresh-while-other-device-is-also-analyzing hits this
// race in practice.
//
// If a future feature needs deterministic conflict resolution (e.g.
// preserving the "best" verdict by length / model / timestamp), this
// engine would need a per-device tiebreaker layer. Current design
// accepts the race.

// Global feature flag — set window.DISABLE_AI_VERDICTS = true at any
// time (DevTools console, settings UI, conditional ?disableAI=1 query
// param wired into a future settings hook) to short-circuit ALL
// analyses across all consumers. Useful for: (a) on-call disabling
// the engine without a deploy if a regression in the engine itself is
// discovered, (b) users who want to keep the AI provider configured
// for chat / lens but pause the per-row verdicts.
function _engineDisabled() {
  return typeof window !== 'undefined' && window.DISABLE_AI_VERDICTS === true;
}

// Map raw API / parse errors to user-readable text. Without this the
// catch block surfaces things like "Failed to execute 'json' on 'Response':
// Unexpected token 'h', \"this is not\"..." into the verdict UI, which is
// horrendous UX. Patterns ordered most-specific first; falls through
// to a clean generic.
function _normalizeErrorMessage(e) {
  const raw = String(e?.message || e || '').slice(0, 500);
  if (/timed out/i.test(raw)) return 'Analysis took too long — try again';
  if (/no json in response|json\.parse|json' on 'response|unexpected token/i.test(raw)) {
    return 'AI sent an unexpected response — try again';
  }
  if (/429|rate limit|too many requests/i.test(raw)) {
    return 'Provider rate-limit — wait a moment + retry';
  }
  if (/401|403|unauthorized|forbidden|api key/i.test(raw)) {
    return 'Provider rejected the request — check Settings → AI';
  }
  if (/cannot reach|network|failed to fetch|err_network|offline/i.test(raw)) {
    return 'Network issue — try again when online';
  }
  if (/quotaexceeded|quota|insufficient/i.test(raw)) {
    return 'Provider quota / credit issue — top up or switch provider';
  }
  // Fallback: short generic. Don't expose internals.
  return 'Analysis failed — try again later';
}

// djb2 hash exposed because every consumer needs it for fingerprinting.
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const VALID_DOTS = ['green', 'yellow', 'red', 'gray'];

const DEFAULT_TIMEOUT_MS = 60000;
const PURGE_DELAY_MS = 1500;

// ─── Global AI concurrency limiter ───────────────────────────────────
// Saving a session triggers three engines (Light Today, Channel mix,
// Session analysis) which all auto-fire concurrently. Most providers
// (Venice, OpenRouter, PPQ) cap concurrent inference at 2 — the third
// call would silently get rejected / rate-limited, making session
// analysis appear to "fail more than the others" even though it's
// just losing the race. Serializing calls here makes auto-fire reliable
// without engine-specific staggering.
//
// Cap of 2 leaves room for 1 user-initiated foreground call to run
// alongside 1 background auto-fire. Adjustable via `window._aiConcurrencyCap`
// for testing or per-environment tuning.
let _activeAICalls = 0;
const _aiCallWaiters = [];
function _aiCap() {
  const w = (typeof window !== 'undefined' && Number.isFinite(window._aiConcurrencyCap))
    ? window._aiConcurrencyCap : 2;
  // Clamp to [1, 8] — Number.isFinite already excludes Infinity/NaN, but a
  // user setting w=999 in DevTools would defeat the cap entirely.
  return Math.min(8, Math.max(1, Math.floor(w)));
}
function _acquireAISlot() {
  if (_activeAICalls < _aiCap()) {
    _activeAICalls++;
    return Promise.resolve();
  }
  return new Promise((resolve) => { _aiCallWaiters.push(resolve); });
}
function _releaseAISlot() {
  _activeAICalls = Math.max(0, _activeAICalls - 1);
  while (_activeAICalls < _aiCap() && _aiCallWaiters.length > 0) {
    const next = _aiCallWaiters.shift();
    _activeAICalls++;
    try { next(); } catch (_) {}
  }
}
// Diagnostic hook — useful for tests + manual debugging without
// breaking encapsulation. Not a public API.
if (typeof window !== 'undefined') {
  window._aiSlotsDebug = () => ({ active: _activeAICalls, waiting: _aiCallWaiters.length, cap: _aiCap() });
}

/**
 * Create an AI verdict engine bound to a particular feature's data shape.
 *
 * @param {object} cfg
 * @param {(id: string) => any} cfg.getTarget — resolve target by id
 * @param {(t: any) => string} cfg.getId — extract id from a target
 * @param {(t: any) => object|null} cfg.getAIAnalysis — read aiAnalysis off the target
 * @param {(t: any, value: object) => void} cfg.setAIAnalysis — write aiAnalysis on the target
 * @param {(t: any) => string} cfg.getFingerprint — deterministic hash of the
 *   target fields that, when changed, should invalidate any cached verdict
 * @param {(t: any) => string} cfg.buildContext — markdown-style prompt context
 * @param {string} cfg.systemPrompt — full system prompt
 * @param {number} [cfg.maxTokens=400] — model output cap
 * @param {(t: any) => boolean} [cfg.canAnalyze] — gate (e.g. session has endedAt)
 * @param {(t: any) => boolean} [cfg.shouldAutoFire] — gate for maybeAfterFinish
 * @param {() => any[]} [cfg.getAllTargets] — used by the orphan purge to find
 *   any persisted `status: 'analyzing'` from pre-fix runs and clear them
 * @param {(parsed: object, target: any) => object} [cfg.parseExtraFields] —
 *   pull out feature-specific fields beyond {dot,tip,detail} (e.g. onboarding's
 *   actions[] array). Returned object is merged into the saved analysis.
 * @param {boolean} [cfg.syncOnSave=true] — fire pushCurrentProfile after save.
 *   Set false for purely local-only verdicts (none currently).
 * @param {number} [cfg.timeoutMs=60000]
 *
 * @returns {object} engine — { analyze, refresh, maybeAfterFinish,
 *   isAnalyzing, getStatus, purgeOrphaned }
 */
export function createAIVerdict(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('createAIVerdict: cfg required');
  const {
    getTarget,
    getId,
    getAIAnalysis,
    setAIAnalysis,
    getFingerprint,
    buildContext,
    systemPrompt,
    maxTokens = 400,
    canAnalyze = (() => true),
    shouldAutoFire = (() => true),
    getAllTargets = (() => []),
    parseExtraFields,
    syncOnSave = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    autoFireRetryDelaysMs = [1000, 4000],
    onStateChange, // optional hook for re-rendering — defaults to window._refreshSunSurfaces
    getScrollAnchor, // optional (target) => '<css-selector>' — pinned through the
                     // post-verdict rebuild so the user stays on the row whose
                     // verdict just landed instead of the auto-pick heuristic
                     // grabbing something else (e.g. session list above).
  } = cfg;

  if (typeof getTarget !== 'function') throw new Error('createAIVerdict: getTarget required');
  if (typeof getId !== 'function') throw new Error('createAIVerdict: getId required');
  if (typeof getAIAnalysis !== 'function') throw new Error('createAIVerdict: getAIAnalysis required');
  if (typeof setAIAnalysis !== 'function') throw new Error('createAIVerdict: setAIAnalysis required');
  if (typeof getFingerprint !== 'function') throw new Error('createAIVerdict: getFingerprint required');
  if (typeof buildContext !== 'function') throw new Error('createAIVerdict: buildContext required');
  if (typeof systemPrompt !== 'string') throw new Error('createAIVerdict: systemPrompt required');

  // In-memory in-flight tracker. Critical: never persisted. A reload mid-
  // call simply resets this Set; the next render falls through to idle
  // since the row's persisted aiAnalysis only carries `ok` or `error`
  // verdicts (never `analyzing`).
  const inflight = new Set();
  // Separate tracker for the auto-fire retry sequence. Holds the id
  // across the WHOLE sequence (initial call + backoffs + retries) so
  // the UI keeps showing "Analyzing..." between attempts instead of
  // flashing "Analysis failed" during the brief window between a
  // failed attempt and the next retry. inflight tracks individual
  // analyze() calls and is briefly empty between attempts; this set
  // covers that gap.
  const retrying = new Set();

  function _refresh(target) {
    // Derive the scroll anchor for THIS verdict's target before the
    // rebuild — if the engine config knows what visual row the verdict
    // belongs to (e.g. a roomId for measurement verdicts), the rebuild
    // can pin the page to that row instead of falling back to the
    // navigate() auto-pick (which sometimes lands on a session card
    // higher up in the DOM and yanks the page).
    //
    // Default: `[data-id="<target.id>"]`. Every engine renders its row
    // with `data-id` matching `getId(target)`, so this works without
    // explicit config. Engines whose verdict belongs to a DIFFERENT
    // DOM element (e.g. measurement verdicts anchored to the room, not
    // the measurement chip) can override via `getScrollAnchor(target)`.
    let anchor = null;
    if (target) {
      if (typeof getScrollAnchor === 'function') {
        try { anchor = getScrollAnchor(target) || null; } catch (_) {}
      }
      if (!anchor) {
        const tid = getId ? getId(target) : null;
        if (tid && typeof tid === 'string') {
          anchor = `[data-id="${CSS.escape(tid)}"]`;
        }
      }
    }
    if (typeof onStateChange === 'function') {
      try { onStateChange(anchor); } catch (_) {}
    } else if (typeof window !== 'undefined' && window._refreshSunSurfaces) {
      try { window._refreshSunSurfaces(anchor); } catch (_) {}
    }
    // Broadcast a custom event so surfaces NOT covered by
    // _refreshSunSurfaces (e.g. the dashboard Light Today chip when
    // the user is on the dashboard during an auto-fire) can react
    // without a full navigate-rebuild. Listeners self-filter by view
    // and only re-render their own slice.
    if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('labcharts-ai-verdict-updated'));
      } catch (_) {}
    }
  }

  function isAnalyzing(id) {
    return inflight.has(id) || retrying.has(id);
  }

  /**
   * Returns the render-state of a target. Consumers use this to drive
   * their renderInline / renderDetail branches without touching the
   * inflight set or aiAnalysis fields directly.
   *
   * @returns {'analyzing'|'ok'|'error'|'idle'}
   */
  function getStatus(target) {
    if (!target) return 'idle';
    const id = getId(target);
    if (inflight.has(id) || retrying.has(id)) return 'analyzing';
    const a = getAIAnalysis(target);
    if (a?.status === 'ok' && a.dot) return 'ok';
    if (a?.status === 'error') return 'error';
    // `status: 'analyzing'` left over from a pre-fix run is treated as
    // idle — the inflight Set is the source of truth, the persisted
    // status field is informational only.
    return 'idle';
  }

  async function analyze(target, opts = {}) {
    if (!target) return null;
    if (_engineDisabled()) return null;
    const id = getId(target);
    if (!id) return null;
    if (inflight.has(id)) return null;
    const fingerprint = getFingerprint(target);
    const cached = getAIAnalysis(target);
    // Cache-hit returns immediately, BEFORE provider / canAnalyze gates.
    // Reading a cached verdict requires no API call and no feature gate
    // — a user who removed their AI provider should still see the
    // verdicts they generated earlier. `opts.force` (set by refresh())
    // bypasses the cache so the ↻ button delivers a fresh API call even
    // when the underlying data fingerprint hasn't changed — without
    // this the button is a silent no-op (Greptile PR #175 review).
    if (cached?.fingerprint === fingerprint && cached?.dot && cached?.status === 'ok' && !opts.force) {
      return cached;
    }
    // Cache miss — claim the inflight slot BEFORE the provider/canAnalyze
    // gates so two near-simultaneous callers can't both fall through to
    // the API call. Any future change that makes hasAIProvider or
    // canAnalyze yield (e.g. token-validation round-trip) would otherwise
    // open a window for duplicate API calls. The finally clause releases
    // the slot on every exit path, including the gate-fail returns below.
    inflight.add(id);
    _refresh(target);
    let slotHeld = false;
    let abandoned = false;
    // AbortController plumbed into callClaudeAPI so the underlying fetch
    // is cancelled when the watchdog wins — without it the request keeps
    // running until the provider responds, wasting tokens / quota and
    // letting a slow-responding provider tie up upstream concurrency
    // even after the user has moved on. Audit P2 from the 2026-05-10
    // review.
    const aborter = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let watchdogTimer = null;
    // Single watchdog covering BOTH the slot wait AND the API call.
    // Earlier draft only raced the API call against the timeout — a
    // saturated concurrency queue could then keep this analyze() pending
    // for (cap × timeoutMs) before even reaching the API, blowing past
    // the documented "Analysis timed out after Xs" guarantee. Greptile
    // PR #175 review caught this.
    const watchdog = new Promise((_, rej) => {
      watchdogTimer = setTimeout(() => {
        abandoned = true;
        try { aborter?.abort(); } catch (_) {}
        rej(new Error(`Analysis timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });
    try {
      if (!hasAIProvider()) return null;
      if (!canAnalyze(target)) return null;
      // Race slot acquisition against the watchdog. If the watchdog wins,
      // _acquireAISlot's promise eventually resolves anyway when a slot
      // frees — at that point we observe `abandoned` and release the
      // slot we just claimed (instead of leaking it to nobody).
      const acquire = _acquireAISlot().then(() => {
        if (abandoned) _releaseAISlot();
        else slotHeld = true;
      });
      await Promise.race([acquire, watchdog]);
      const ctx = buildContext(target);
      const apiCall = callClaudeAPI({
        system: systemPrompt,
        messages: [{ role: 'user', content: ctx }],
        maxTokens,
        signal: aborter?.signal,
      });
      const result = await Promise.race([apiCall, watchdog]);
      const text = (result && typeof result === 'object') ? (result.text || '') : (typeof result === 'string' ? result : '');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response');
      const parsed = JSON.parse(match[0]);
      const dot = VALID_DOTS.includes(parsed.dot) ? parsed.dot : 'gray';
      const tip = String(parsed.tip || '').slice(0, 240);
      const detail = String(parsed.detail || '').slice(0, 800);
      let extra = {};
      if (typeof parseExtraFields === 'function') {
        try { extra = parseExtraFields(parsed, target) || {}; } catch (_) {}
      }
      // Recompute fingerprint at write-time. Captures the case where the
      // user edited the target while the API was in flight — the verdict
      // was generated from the OLD context, but writing it with the NEW
      // fingerprint would mark it stable when it actually no longer
      // matches the data the model saw. Use the original fingerprint so
      // a render after the edit correctly flags this verdict as stale.
      const value = Object.assign({
        dot, tip, detail, fingerprint,
        generatedAt: Date.now(),
        status: 'ok',
      }, extra);
      setAIAnalysis(target, value);
      await saveImportedData();
      // Push immediately so other devices see the new verdict in seconds
      // rather than waiting for the 10s onDataSaved debounce.
      if (syncOnSave && isSyncEnabled?.()) {
        pushCurrentProfile().catch(() => {});
      }
      return value;
    } catch (e) {
      const prev = getAIAnalysis(target);
      const errSidecar = {
        lastErrorAt: Date.now(),
        lastErrorMessage: _normalizeErrorMessage(e),
      };
      // Don't destroy a previously-valid `ok` verdict on a transient
      // network / quota / parse failure — Greptile PR #175 review caught
      // this. The user pressed Refresh on a working verdict; if the
      // refresh fails the right behaviour is to keep showing the old
      // verdict and surface the error in a sidecar field, not to wipe
      // the dot/tip/detail that previously informed them.
      // No-prev (or prior already-error) — write a fresh error state so
      // the row shows "Analysis failed" instead of the idle CTA.
      if (prev?.status === 'ok' && prev?.dot) {
        setAIAnalysis(target, Object.assign({}, prev, errSidecar));
      } else {
        setAIAnalysis(target, Object.assign({}, prev || {}, errSidecar, {
          status: 'error',
          errorAt: errSidecar.lastErrorAt,
          errorMessage: errSidecar.lastErrorMessage,
        }));
      }
      // Persist so the error survives a reload too — best-effort.
      try { await saveImportedData(); } catch (_) {}
      return null;
    } finally {
      // If watchdog won and we never acquired the slot, the .then above
      // handles release once the slot eventually frees. Don't double-
      // release here.
      abandoned = true;
      if (watchdogTimer) { try { clearTimeout(watchdogTimer); } catch (_) {} }
      if (slotHeld) _releaseAISlot();
      inflight.delete(id);
      _refresh(target);
    }
  }

  /** Run analyze with force=true. Public entry for refresh buttons. */
  async function refresh(id) {
    const target = getTarget ? getTarget(id) : null;
    if (!target) return null;
    return analyze(target, { force: true });
  }

  // Auto-fire retry policy. We've observed that auto-fire after a save
  // fails noticeably more often than manual refresh — likely a mix of
  // first-call cold-start latency, occasional JSON-parse blips when the
  // model adds a preamble, and provider-side rate-limit jitter. Manual
  // refresh almost always succeeds on the second try, so we automate
  // that retry. Default backoff steps (1s, 4s — see autoFireRetryDelaysMs
  // above) cover the common transient patterns without spending an
  // unbounded budget on permanent errors.
  // Auth/quota errors are NOT retried — those are user-actionable and
  // re-asking would just burn tokens until the underlying issue is fixed.
  function _isRetryableError(msg) {
    if (!msg) return true; // unknown errors are retryable; auth-style would be flagged below
    const m = String(msg);
    if (/Provider rejected|Provider quota|credit issue|check Settings/i.test(m)) return false;
    return true; // timeout, parse blip, rate-limit, network — all worth a second look
  }

  /** Fire-and-forget after a target finishes (e.g. session stop, measurement save). */
  function maybeAfterFinish(target) {
    if (!target) return;
    if (!hasAIProvider()) return;
    if (!shouldAutoFire(target)) return;
    const id = getId(target);
    if (retrying.has(id)) return; // already running
    retrying.add(id);
    _refresh(target);
    setTimeout(async () => {
      try {
        try { await analyze(target); }
        catch (_) { /* analyze writes its own error state */ }
        const delays = Array.isArray(autoFireRetryDelaysMs) ? autoFireRetryDelaysMs : [];
        for (let i = 0; i < delays.length; i++) {
          const fresh = getTarget ? getTarget(id) : target;
          const a = fresh ? getAIAnalysis(fresh) : null;
          if (a?.status !== 'error') return; // success or moved on
          if (!_isRetryableError(a.errorMessage)) return;
          await new Promise(r => setTimeout(r, delays[i]));
          const t = getTarget ? getTarget(id) : target;
          if (!t) return;
          try { await analyze(t, { force: true }); }
          catch (_) {}
        }
      } finally {
        retrying.delete(id);
        // Use the latest version of the target so the scroll-anchor
        // lookup reflects the row's current shape (it gained an
        // aiAnalysis field during this run).
        _refresh(getTarget ? getTarget(id) : target);
      }
    }, 0);
  }

  /**
   * Clear any orphaned `status: 'analyzing'` fields persisted by pre-fix
   * runs that died mid-flight. The new code path never persists analyzing
   * status, but legacy rows (sun sessions analyzed in v0 of the feature,
   * or rows synced in from a peer device that's still on the old code)
   * may still carry it. Renders treat lingering `analyzing` as idle, but
   * this purge actively wipes the dead field so localStorage shrinks +
   * the per-row CRDT hash changes + peers pick up the cleanup on next
   * pull. Best-effort, no-throw.
   */
  async function purgeOrphaned() {
    try {
      const targets = getAllTargets();
      let dirty = false;
      for (const t of targets) {
        const a = getAIAnalysis(t);
        if (a?.status === 'analyzing' && !inflight.has(getId(t))) {
          // For row-level: clear aiAnalysis entirely (no useful state).
          // For map-level (e.g. lightDailyVerdicts) this still works
          // because setAIAnalysis is responsible for the assignment;
          // engines pass a delete-by-replace shim.
          setAIAnalysis(t, null);
          dirty = true;
        }
      }
      if (dirty) {
        await saveImportedData();
        _refresh();
      }
    } catch (_) {
      // Failures here are not user-actionable.
    }
  }

  // Schedule an automatic purge on next tick. Timer rather than immediate
  // so the data layer + dependent modules are fully initialized first.
  if (typeof window !== 'undefined') {
    setTimeout(purgeOrphaned, PURGE_DELAY_MS);
  }

  return {
    analyze,
    refresh,
    maybeAfterFinish,
    isAnalyzing,
    getStatus,
    purgeOrphaned,
  };
}

// ─── Render helpers ────────────────────────────────────────────────────
//
// Most consumers render their inline / detail blocks slightly differently
// (different parent class names, different CTA copy), but the dot prefix
// and the ok/error/idle layouts are identical enough to share. These
// helpers are optional — consumers can call them or hand-roll their HTML.

export function dotPrefix(dot) {
  if (dot === 'green') return '✓';
  if (dot === 'yellow') return '⚠';
  if (dot === 'red') return '▲';
  return '·';
}

export const VERDICT_DOT_VALUES = VALID_DOTS;
