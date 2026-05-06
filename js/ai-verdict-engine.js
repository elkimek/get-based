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

// djb2 hash exposed because every consumer needs it for fingerprinting.
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const VALID_DOTS = ['green', 'yellow', 'red', 'gray'];

const DEFAULT_TIMEOUT_MS = 60000;
const PURGE_DELAY_MS = 1500;

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
    onStateChange, // optional hook for re-rendering — defaults to window._refreshSunSurfaces
  } = cfg;

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

  function _refresh() {
    if (typeof onStateChange === 'function') {
      try { onStateChange(); } catch (_) {}
    } else if (typeof window !== 'undefined' && window._refreshSunSurfaces) {
      try { window._refreshSunSurfaces(); } catch (_) {}
    }
  }

  function isAnalyzing(id) {
    return inflight.has(id);
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
    if (inflight.has(getId(target))) return 'analyzing';
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
    if (!hasAIProvider()) return null;
    if (!canAnalyze(target)) return null;
    const id = getId(target);
    if (!id) return null;
    if (inflight.has(id)) return null;
    const fingerprint = getFingerprint(target);
    const cached = getAIAnalysis(target);
    // Cache-hit on EITHER auto OR force when the fingerprint is stable
    // and the cached verdict is good. Force used to skip this check —
    // which meant a manual refresh on an unchanged target would re-run
    // the API for a verdict that should be identical, AND would write
    // a row with a new generatedAt, churning the per-row CRDT (extra
    // ~800B push to peers for nothing). Force still bypasses the cache
    // when the user genuinely wants a re-roll on changed data, since
    // the fingerprint will differ in that case.
    if (cached?.fingerprint === fingerprint && cached?.dot && cached?.status === 'ok') {
      return cached;
    }
    inflight.add(id);
    _refresh();
    try {
      const ctx = buildContext(target);
      const apiCall = callClaudeAPI({
        system: systemPrompt,
        messages: [{ role: 'user', content: ctx }],
        maxTokens,
      });
      const result = await Promise.race([
        apiCall,
        new Promise((_, rej) => setTimeout(
          () => rej(new Error(`Analysis timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        )),
      ]);
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
      const prev = getAIAnalysis(target) || {};
      setAIAnalysis(target, Object.assign({}, prev, {
        status: 'error',
        errorAt: Date.now(),
        errorMessage: String(e?.message || e).slice(0, 200),
      }));
      // Persist the error state so the user sees "Analysis failed"
      // after a reload too — without this, a transient quota / network
      // error leaves the row in error in memory only, and the next
      // render after reload shows idle (back to "Analyze" CTA) with no
      // explanation of what went wrong. Best-effort: if save itself
      // fails, the in-memory error state still surfaces this session.
      try { await saveImportedData(); } catch (_) {}
      return null;
    } finally {
      inflight.delete(id);
      _refresh();
    }
  }

  /** Run analyze with force=true. Public entry for refresh buttons. */
  async function refresh(id) {
    const target = getTarget ? getTarget(id) : null;
    if (!target) return null;
    return analyze(target, { force: true });
  }

  /** Fire-and-forget after a target finishes (e.g. session stop, measurement save). */
  function maybeAfterFinish(target) {
    if (!target) return;
    if (!hasAIProvider()) return;
    if (!shouldAutoFire(target)) return;
    setTimeout(() => analyze(target).catch(() => {}), 0);
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
