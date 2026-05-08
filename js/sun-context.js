// sun-context.js — buildSunContext({ tier }) for AI integration.
// Two-tier prompt blob; per-session detail moved to a tool-call API.
//
//   tier: 'always'   ~520 tok — Lifelight summary + 7d rolling + active deficits
//                              + indoor environment (every chat)
//   tier: 'standard' +1200 tok — + 30-day session table + biomarker correlations
//                              (auto-escalated when chat keywords trigger)
//
// Per-session detail (formerly the deep tier) is exposed as the
// getSunSessionDetail(id) and getSunSessionsSlice(opts) APIs, callable
// by both chat tool-calls and MCP/agent consumers. That's the right
// shape for that data — it doesn't belong in every prompt.

import { state } from './state.js';
import { getSunCorrelations } from './sun-correlations.js';

// ═══════════════════════════════════════════════
// BODY REGIONS IN AI CONTEXT (per-profile, default OFF)
// ═══════════════════════════════════════════════
// Specific anatomical regions (face, breast-chest, genitals…) are the
// most personally-identifying detail in a sun session. Sending them to a
// non-E2EE AI provider (PPQ / Routstr / OpenRouter / Custom) without an
// explicit consent gate would mean every chat that includes the standard-
// tier session table — and every agent slice over getSunSessionsSlice() —
// silently exfiltrates `regions: ['breast-chest','genitals',…]`.
//
// Default OFF. The chat session table renders preset names or a "—" when
// disabled; agent slices project body summary (preset, fraction, sunscreen,
// glassBetween) WITHOUT the regions array. Per-profile so each profile
// keeps its own consent state — your "main" profile may opt in, a "Test"
// profile stays off.
function _bodyRegionsCtxKey() {
  const pid = localStorage.getItem('labcharts-active-profile') || 'default';
  return `labcharts-${pid}-ai-include-body-regions`;
}
export function isBodyRegionsInAIContext() {
  return localStorage.getItem(_bodyRegionsCtxKey()) === 'on';
}
export function setBodyRegionsInAIContext(on) {
  localStorage.setItem(_bodyRegionsCtxKey(), on ? 'on' : 'off');
}

// ─── Public API ────────────────────────────────────────────────────────

export function buildSunContext({ tier = 'always' } = {}) {
  const sessions = state.importedData?.sunSessions || [];
  const deviceSessions = state.importedData?.deviceSessions || [];
  // A user with only device sessions (winter PBM users, indoor SAD-
  // lamp users, anyone in a high-latitude city for 6 months) — OR a
  // user with only an indoor light environment surveyed (rooms /
  // screens / audits but no outdoor exposure logged) — still generates
  // Light-lens signal the AI should see. Earlier this gate was just
  // `sessions.length === 0` which silently dropped both classes from
  // every always-tier prompt.
  const env = state.importedData?.lightEnvironment;
  const audits = state.importedData?.lightAudits || [];
  const hasEnv = (env && Array.isArray(env.rooms) && env.rooms.length > 0)
    || (env && Array.isArray(env.screens) && env.screens.length > 0)
    || audits.length > 0;
  if (sessions.length === 0 && deviceSessions.length === 0 && !hasEnv) return '';

  // Section marker is 'sun' (not 'sunSessions') so agent callers can
  // pull this block via getbased_section('sun') matching the documented
  // API in docs/guide/agent-access.md. The block actually contains sun
  // sessions + light environment + device sessions + audits — 'sun' is
  // the umbrella key for the whole Light & Sun lens.
  let ctx = '[section:sun]\n## Light & Sun lens\n\n';
  ctx += alwaysTierBlock(sessions);

  if (tier === 'standard' || tier === 'deep') {
    ctx += standardTierBlock(sessions);
  }

  ctx += '[/section:sun]\n\n';

  // Runtime token-budget guard. Always-tier canonical case is ~1400
  // chars (~520 tok). A heavy user with full env + many warnings +
  // calibration line + per-room audit before/after annotations + active
  // deficits can push toward 3500+. Bumped SOFT 2500 → 3500 in 2026-05
  // after Žofka caught calibration + indoor env getting silently
  // dropped on a real load — those were the two highest-signal blocks.
  // Trim priority reordered (least-load-bearing first):
  //   1. trailing audit before/after detail (kept the most-recent audit
  //      only — older deltas are nice-to-have)
  //   2. active warnings overflow (already summarized)
  //   3. deficit-axes detail (d2/d3 numbers — burden tier survives)
  //   4. older audits past the most recent
  //   5. indoor-environment block (HARD cap only — multi-hour daily
  //      exposure block, surrender last)
  //   6. calibration anchor (HARD cap only — single line, anchors AI
  //      estimates to bloodwork; drop after indoor env, never before)
  const SOFT = 3500, HARD = 5500;
  if (tier === 'always' && ctx.length > SOFT) {
    ctx = _trimToBudget(ctx, SOFT);
  }
  if (ctx.length > HARD) {
    ctx = _trimToBudget(ctx, HARD, /* aggressive */ true);
  }
  return ctx;
}

// Stepwise drop sections until the blob fits the budget. Reordered
// 2026-05-08 — calibration anchor + indoor env are the highest-signal
// blocks; they used to drop FIRST which was backwards. Now they survive
// the soft cap; only the hard cap touches them, and indoor env goes
// before calibration (calibration is single-line, indoor env is bulk).
function _trimToBudget(ctx, budget, aggressive = false) {
  if (ctx.length <= budget) return ctx;

  // 1. Trim per-room audit before/after detail beyond the most-recent
  // audit. The "(was: ... on YYYY-MM-DD)" tags are valuable for the
  // newest audit (did the mitigation help?), low marginal value for
  // older audits where the agent can already see chronological dates.
  // Match the second-and-onward audit blocks via the "  - YYYY-..."
  // pattern; first occurrence keeps its before/after annotations.
  ctx = ctx.replace(/( \(was: [^)]+ on [^)]+\))/g, (m, _full, offset, str) => {
    // Find the audit block this annotation belongs to. Walk backwards
    // to the nearest "  - " line — that's its parent audit. The first
    // such audit in the section keeps its tags; subsequent ones lose them.
    const head = str.slice(0, offset);
    const lastAuditStart = head.lastIndexOf('\n  - ');
    if (lastAuditStart < 0) return m;
    const sectionStart = head.indexOf('### Indoor light environment');
    if (sectionStart < 0) return m;
    const auditsBefore = (head.slice(sectionStart, lastAuditStart).match(/\n  - /g) || []).length;
    return auditsBefore === 0 ? m : '';
  });
  if (ctx.length <= budget) return ctx;

  // 2. Trim "Active light-tool warnings" list to first 3.
  ctx = ctx.replace(/(- Active light-tool warnings: )([^\n]*)/, (_, head, list) => {
    const items = list.split('; ').filter(s => !/^\+\d+ more$/.test(s));
    const kept = items.slice(0, 3);
    const overflow = items.length - 3;
    return head + kept.join('; ') + (overflow > 0 ? `; +${overflow} more` : '');
  });
  if (ctx.length <= budget) return ctx;

  // 3. Drop the deficit-axes detail (d2 / d3) but keep the burden tier.
  ctx = ctx.replace(/( · d2=[\d.]+ \(intensity gap\) · d3=[\d.]+ \(after-sunset blue\))/, '');
  if (ctx.length <= budget) return ctx;

  // 4. Drop older audits past the most recent — keep one full audit
  // block, drop the rest. Same logic as step 1 but at the audit level.
  ctx = ctx.replace(/(### Light audits[^\n]*\n(?:[^\n]*\n)*?  - [^\n]*\n(?:    · [^\n]*\n)*)([\s\S]*?)(?=\n[A-Z]|\n\[|\n###|$)/, (m, kept, rest) => {
    return kept;
  });
  if (ctx.length <= budget) return ctx;

  if (aggressive) {
    // 5. Hard-cap fallback: drop the indoor-environment block (rooms +
    // screens + audits + burden + warnings — the whole multi-hour
    // exposure block). Indoor env goes BEFORE calibration because it's
    // bulk and calibration is single-line bloodwork-grounding.
    ctx = ctx.replace(/\n### Indoor light environment[\s\S]*?(?=\n###|\n\[\/section)/, '');
    if (ctx.length <= budget) return ctx;
    // 6. Last resort: drop the calibration anchor.
    ctx = ctx.replace(/\n### Calibration anchor[\s\S]*?(?=\n###|\n\[\/section)/, '');
  }
  return ctx;
}

// ─── Tier: always (~520 tok) ───────────────────────────────────────────

function alwaysTierBlock(sessions) {
  // Combine outdoor sun + indoor device contributions — channels reflect the
  // full biological state, not just one source class.
  const sunTot7 = window.rollingChannelTotals ? window.rollingChannelTotals(7) : {};
  const sunTot30 = window.rollingChannelTotals ? window.rollingChannelTotals(30) : {};
  const devTot7 = window.rollingDeviceTotals ? window.rollingDeviceTotals(7) : {};
  const devTot30 = window.rollingDeviceTotals ? window.rollingDeviceTotals(30) : {};
  const totals7d = mergeTotalsCtx(sunTot7, devTot7);
  const totals30d = mergeTotalsCtx(sunTot30, devTot30);
  const medToday = window.cumulativeMEDToday ? window.cumulativeMEDToday() : 0;
  const lastSession = sessions.filter(s => s.endedAt).slice(-1)[0];
  const activeSession = sessions.find(s => !s.endedAt);

  const devices = state.importedData?.lightDevices || [];
  const devSessions = state.importedData?.deviceSessions || [];

  const sunDefaults = state.importedData?.sunDefaults || {};
  let baselineLine = '';
  if (sunDefaults.fitzpatrick) {
    baselineLine = `\n- Skin type Fitzpatrick ${sunDefaults.fitzpatrick}; home lighting: ${sunDefaults.homeLight || 'unknown'}; eyewear: ${sunDefaults.eyewear || 'unknown'}.`;
    // The Ott score is a 10-question YES/NO survey. ottScore is only
    // set if the user actually saved survey answers — absence means
    // "not surveyed", presence (including 0) means "answered and that's
    // the score". A 0 with the survey taken is a real signal: the user
    // genuinely answered no to every malillumination factor. The AI
    // can sanity-check that against context cards if 0 contradicts
    // other lifestyle data; that's not the context block's job.
    if (typeof sunDefaults.ottScore === 'number') {
      // Reframed 2026-05-08 as ALIGNMENT (higher = better) instead of
      // BURDEN (higher = worse). Matches the dashboard convention
      // (`${10 - ottScore}/10 aligned`) and human intuition (10/10 = good).
      // Storage stays burden-coded — `ottScore` is still N-checked-yes
      // out of 10 — but the AI sees it presented as "10 - N aligned" so
      // the directionality is unambiguous. Žofka audit 2026-05-08 caught
      // ambiguity in the burden phrasing ("0/10 burden" reads as either
      // "0 burden = great" or "0 alignment = terrible" depending on the
      // reader's prior).
      const aligned = 10 - sunDefaults.ottScore;
      baselineLine += ` Ott self-survey alignment: ${aligned}/10 (self-reported; counts how many of 10 light-burden lifestyle factors the user said NO to; 10 = aligned, no factors flagged; 0 = all 10 flagged). Cross-check against logged screens/rooms/outdoor sessions — the survey can disagree with the data.`;
    }
  }

  // Compact lifelight summary — counts + device-library listing. Pre-2026-
  // 05-08 we elided device names ("AI doesn't need to know Joovv Mini 3.0
  // by brand") which was wrong: the agent legitimately needs to know what
  // hardware the user owns to recommend "use your existing X on the chest"
  // or check spectral compatibility. Each device renders as a one-liner
  // with the fields that matter: brand + model + type + peak wavelengths
  // + irradiance @ reference distance. Lux is included for SAD lamps that
  // declare lux instead of mW/cm².
  const deviceListLine = devices.length > 0
    ? '\n' + devices.map(d => {
        const peaks = Array.isArray(d.peakWavelengths) && d.peakWavelengths.length
          ? d.peakWavelengths.join('/') + 'nm' : 'no peaks declared';
        const irr = d.mwPerCm2At15cm
          ? `${d.mwPerCm2At15cm} mW/cm² @ ${d.recommendedDistanceCm || 15}cm`
          : (d.lux ? `${d.lux.toLocaleString()} lux` : 'no irradiance declared');
        return `  - ${d.brand || '?'} ${d.model || '?'} (${d.type || 'device'}, ${peaks}, ${irr})`;
      }).join('\n')
    : '';

  // Active session + most-recent session lines drop when null. Verbose
  // 30-day channel totals were dropped from always-tier output — they're
  // computed for deficit detection but the 7-day totals are the
  // recency-relevant signal in chat. Standard tier reintroduces the
  // 30-day breakdown.
  let block = `### Lifelight summary
- Outdoor sessions: ${sessions.length} · device sessions: ${devSessions.length} · devices in library: ${devices.length}${baselineLine}${deviceListLine}
- Today's cumulative MED: ${(medToday * 100).toFixed(0)}%${medToday > 1 ? ' (over personal MED — exposure risk)' : ''}
${activeSession ? `- ACTIVE SESSION in progress (started ${formatRelative(activeSession.startedAt)})\n` : ''}${lastSession ? `- Most recent outdoor session: ${formatRelative(lastSession.endedAt)} (${Math.round(lastSession.durationMin || 0)} min)\n` : ''}
### 7-day rollup (sun + devices combined; tier vs typical weekly target)
${formatChannelTotals(totals7d)}

`;

  // Deficit detection — flag channels at <10% of literature reference (rough
  // heuristic). Gated behind a real baseline window so a brand-new user with
  // zero exposure logs isn't told they have 6 simultaneous deficits — that's
  // a measurement gap, not a signal. Once they've logged ≥7 events of any
  // kind we have enough to distinguish "user doesn't expose" from "user
  // hasn't logged yet."
  const baselineCount = sessions.length + devSessions.length;
  const deficits = baselineCount >= 7 ? detectDeficits(totals30d) : [];
  if (deficits.length > 0) {
    block += `### Active light deficits
${deficits.map(d => `- ${d.label}: ${d.note}`).join('\n')}

`;
  }

  // Indoor light environment — rooms, screens, audits. Most users
  // spend 8-14 h/day under indoor lights, so the AI needs the picture
  // to make sense of circadian / sleep / mood signals. Without this
  // block the prompt only saw outdoor + device exposure and was blind
  // to the dominant share of the user's daily light budget.
  block += lightEnvironmentBlock();

  // Calibration anchor — links modeled doses to ground-truth bloodwork
  // and sleep so the AI can reality-check its own estimates instead of
  // running blind on the model. One line, only when we have at least
  // one of the two data points.
  block += calibrationLine();

  return block;
}

// Pull the most recent 25-OH-D bloodwork value (vitamins.vitaminD per
// the schema) plus the wearable-summary sleep_score rolling state.
// Returns '' when neither is present so users on day 1 don't get a noisy
// "no calibration available" line in every prompt.
function calibrationLine() {
  // Latest 25-OH-D — entries store markers as a flat object keyed by
  // `category.markerKey`, NOT nested by category. Earlier draft used
  // `e?.vitamins?.vitaminD` which never resolved against real data —
  // the calibration block silently failed for every user with bloodwork
  // logged. Same bug class sun-correlations.js carried until v1.7.20.
  let vitD = null;
  let vitDDate = null;
  const entries = state.importedData?.entries || [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const v = e?.markers?.['vitamins.vitaminD'];
    if (typeof v === 'number' && isFinite(v) && v > 0) {
      vitD = v;
      vitDDate = e.date || null;
      break;
    }
  }

  // Sleep — wearable summary, if computed and recent.
  let sleep = null;
  const sleepMetric = state.importedData?.wearableSummary?.metrics?.sleep_score;
  if (sleepMetric && typeof sleepMetric.rolling?.d7 === 'number') {
    sleep = sleepMetric;
  }

  if (vitD == null && sleep == null) return '';

  const parts = [];
  if (vitD != null) {
    // Schema unit is nmol/L; ng/mL = nmol/L ÷ 2.5. Surface both for the
    // AI since literature splits the convention by region. Round each.
    const ngml = Math.round(vitD / 2.5);
    parts.push(`25-OH-D ${ngml} ng/mL (${Math.round(vitD)} nmol/L)${vitDDate ? `, ${vitDDate}` : ''}`);
  }
  if (sleep != null) {
    const d7 = Math.round(sleep.rolling.d7);
    const baseline = sleep.baseline != null ? Math.round(sleep.baseline) : null;
    let s = `7d sleep score ${d7}`;
    if (baseline != null && baseline !== d7) s += ` (baseline ${baseline}, ${sleep.trend30d || 'flat'})`;
    parts.push(s);
  }
  return `\n### Calibration anchor (model vs ground truth)\n- ${parts.join(' · ')}\n\n`;
}

// Indoor light environment summary — rooms, screens, light audits,
// computed indoor burden. Returns empty string when nothing is logged
// so the prompt stays compact for users who haven't set this up.
function lightEnvironmentBlock() {
  const env = state.importedData?.lightEnvironment;
  const audits = state.importedData?.lightAudits || [];
  const rooms = (env && Array.isArray(env.rooms)) ? env.rooms : [];
  const screens = (env && Array.isArray(env.screens)) ? env.screens : [];
  if (rooms.length === 0 && screens.length === 0 && audits.length === 0) return '';

  let s = `### Indoor light environment\n`;
  if (rooms.length > 0) {
    s += `- Rooms tracked: ${rooms.length}`;
    const eveningRooms = rooms.filter(r => r.eveningUseAfterSunset || (r.eveningHoursAfterSunset || 0) > 0);
    if (eveningRooms.length > 0) {
      s += `; ${eveningRooms.length} used after sunset`;
    }
    const blueBlocked = rooms.filter(r => r.blueBlocker).length;
    if (blueBlocked > 0) s += `; ${blueBlocked} with blue-blocker`;
    s += '\n';
    // Per-room one-liner: name, primary source, hours/day, severity.
    // Lets the agent answer "which room is the worst?" instead of just
    // knowing the burden tier rolled up across all rooms.
    for (const r of rooms) {
      const src = r.primarySource || 'unknown source';
      const hrs = r.hoursOccupiedPerDay ? `${r.hoursOccupiedPerDay}h/day` : '';
      const evHr = (r.eveningHoursAfterSunset || (r.eveningUseAfterSunset ? 1 : 0));
      const evening = evHr ? `${evHr}h after sunset` : '';
      const severity = r.aiAnalysis?.dot ? ` · ${r.aiAnalysis.dot} verdict` : '';
      const parts = [src, hrs, evening].filter(Boolean).join(', ');
      s += `  - ${r.name || 'Room'} (${parts})${severity}\n`;
    }
  }
  if (screens.length > 0) {
    const evening = screens.filter(sc => sc.eveningUseAfterSunset).length;
    const blueOff = screens.filter(sc => sc.eveningUseAfterSunset && !sc.blueBlocker).length;
    s += `- Screens tracked: ${screens.length}`;
    if (evening > 0) s += `; ${evening} used after sunset`;
    if (blueOff > 0) s += ` (${blueOff} without blue-blocker — direct retinal melatonin suppression)`;
    s += '\n';
    // Per-screen one-liner: device type, hours, evening use, blocker status.
    for (const sc of screens) {
      const hours = sc.hoursPerDay ? `${sc.hoursPerDay}h/day` : '';
      const eveHr = sc.eveningUseAfterSunset || 0;
      const eve = eveHr > 0 ? `${eveHr}h after sunset` : 'daytime only';
      const blocker = sc.blueBlockerEnabled ? '✓ blocker' : '✗ no blocker';
      const parts = [hours, eve, blocker].filter(Boolean).join(', ');
      s += `  - ${sc.device || 'screen'} (${parts})\n`;
    }
  }
  // `lightAudits` = before/after snapshots; Tool 8 walkthroughs = per-pause
  // lux measurements bound to rooms (`lightMeasurements` with tool='audit').
  // Folded onto one line — the AI cares about presence, not the distinction.
  const eyeLevel = (state.importedData?.lightMeasurements || []).filter(m => m && m.tool === 'audit');
  if (audits.length > 0 || eyeLevel.length > 0) {
    const parts = [];
    if (audits.length > 0) parts.push(`${audits.length} before/after`);
    if (eyeLevel.length > 0) parts.push(`${eyeLevel.length} eye-level`);
    s += `- Light audits: ${parts.join(' · ')}\n`;
    // List audit dates + per-room measurement aggregate so the agent
    // can compute deltas between audits ("Office went from 240 lux at
    // 2700K to 580 lux at 4100K"). Cap at 5 most-recent audits to
    // bound the token budget; per-audit, show one line per room with
    // its tool readings (latest per tool when there are duplicates).
    const recentAudits = audits.slice().sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 5);
    // Build a reverse map: for each audit, what was the immediately
    // PRIOR audit's reading for the same room? That's the "before"
    // snapshot — without it the agent only sees the post-audit state
    // (5027 lux, 6014K) and can't compute a delta. With it, the line
    // reads "5027 lux, 6014K (was 240 lux, 2700K → +4787 lux, +3314K)".
    const auditsByDateAsc = audits.slice().sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const _measByAudit = audit => {
      const out = {};
      for (const m of (audit.measurements || [])) {
        if (!m.roomId) continue;
        const r = out[m.roomId] = out[m.roomId] || {};
        if (!r[m.tool] || (m.capturedAt || 0) > (r[m.tool].capturedAt || 0)) r[m.tool] = m;
      }
      return out;
    };
    for (const a of recentAudits) {
      const lbl = a.label || `Audit`;
      const dot = a.aiAnalysis?.dot ? ` · ${a.aiAnalysis.dot} verdict` : '';
      // Find the prior audit (most-recent before this one) for delta
      // computation. Walk auditsByDateAsc backwards from before this audit.
      const thisIdx = auditsByDateAsc.findIndex(x => x.id === a.id);
      const priorAudit = thisIdx > 0 ? auditsByDateAsc[thisIdx - 1] : null;
      // When this is the FIRST audit, surface that explicitly so the
      // agent reads "no prior to compare against" rather than "before
      // snapshot is missing." Žofka audit 2026-05-08 read the absent
      // (was: ...) tags as a missing feature; the absence is the data.
      const baselineTag = priorAudit ? '' : ' · baseline — no prior audit to compare';
      s += `  - ${a.date || '?'}: ${lbl} (${(a.rooms || []).length} rooms, ${(a.measurements || []).length} measurements)${dot}${baselineTag}\n`;
      // Per-room measurement summary inside this audit. Group readings
      // by roomId, take the latest per tool, render as a one-liner.
      const auditRooms = a.rooms || [];
      const roomById = Object.fromEntries(auditRooms.map(r => [r.id, r]));
      const byRoom = _measByAudit(a);
      const priorByRoom = priorAudit ? _measByAudit(priorAudit) : {};
      for (const [roomId, byTool] of Object.entries(byRoom)) {
        const room = roomById[roomId];
        if (!room) continue;
        const fragments = [];
        if (byTool.lux) fragments.push(`${Math.round(byTool.lux.value)} lux`);
        if (byTool.cct) fragments.push(`${Math.round(byTool.cct.value)}K`);
        if (byTool.flicker) fragments.push(`flicker ${Math.round(byTool.flicker.value)}`);
        if (byTool.darkness) fragments.push(`darkness ${Number(byTool.darkness.value).toFixed(1)} lux`);
        if (byTool.spectrum) fragments.push(`spectrum: ${byTool.spectrum.value || byTool.spectrum.extra?.label || '?'}`);
        if (fragments.length) {
          // Append the prior-audit reading inline as "(was: 240 lux,
          // 2700K)" — agent-readable delta context. Only emits when
          // we actually have a prior reading for the same room/tool.
          const prior = priorByRoom[roomId];
          const priorFrags = [];
          if (prior?.lux && byTool.lux) priorFrags.push(`${Math.round(prior.lux.value)} lux`);
          if (prior?.cct && byTool.cct) priorFrags.push(`${Math.round(prior.cct.value)}K`);
          if (prior?.flicker && byTool.flicker) priorFrags.push(`flicker ${Math.round(prior.flicker.value)}`);
          if (prior?.darkness && byTool.darkness) priorFrags.push(`darkness ${Number(prior.darkness.value).toFixed(1)} lux`);
          const priorTag = priorFrags.length
            ? ` (was: ${priorFrags.join(', ')} on ${priorAudit.date || '?'})`
            : '';
          s += `    · ${room.name || 'Room'}: ${fragments.join(', ')}${priorTag}\n`;
        }
      }
    }
  }
  // Indoor burden tier + deficit axes — collapsed onto one line. Burden is
  // the qualitative summary, d2/d3 are the components that drove it.
  if (typeof window.computeIndoorBurden === 'function') {
    try {
      const burden = window.computeIndoorBurden();
      if (burden && typeof burden === 'object') {
        // Use the helper's own label so the AI surface matches the
        // page UI verbatim. The helper returns 3 tiers (0/1/2 →
        // Light/Moderate/Heavy load); earlier code surfaced a 5-tier
        // map that didn't exist anywhere else.
        const burdenLabel = burden.label || ['Light load', 'Moderate load', 'Heavy load'][burden.tier] || 'unknown';
        let line = `- Indoor light burden: ${burdenLabel} (tier ${burden.tier}/2 · 0=light, 2=heavy across screens/sleep/daylight)`;
        if (typeof window.computeDeficitAxes === 'function') {
          try {
            const axes = window.computeDeficitAxes();
            if (axes && (axes.d2 != null || axes.d3 != null)) {
              line += ` · d2=${(axes.d2 ?? 0).toFixed(2)} (intensity gap) · d3=${(axes.d3 ?? 0).toFixed(2)} (after-sunset blue)`;
            }
          } catch (e) {
            if (window.isDebugMode && window.isDebugMode()) console.warn('[sun-context] computeDeficitAxes failed', e);
          }
        }
        s += line + '\n';
      }
    } catch (e) {
      if (window.isDebugMode && window.isDebugMode()) console.warn('[sun-context] indoor-burden line build failed', e);
    }
  }
  // Concrete tool measurements that warrant the AI's attention. We
  // surface only the warning-level readings — the user has 8 tools
  // and might log dozens of measurements, dumping all of them would
  // bloat the prompt. Thresholds match the on-device severity dots:
  //   • flicker score ≥ 2 (visible PWM, modulation > 30%)
  //   • sleep darkness > 1 lux at the pillow (above the WHO bedroom
  //     dark-enough threshold for full melatonin secretion)
  //   • after-sunset CCT > 3500K (still cool/blue when ought-to-be-warm)
  //   • measurements older than 90 days are skipped — context drift
  const measurements = state.importedData?.lightMeasurements || [];
  const ninetyDaysAgo = Date.now() - 90 * 86400 * 1000;
  const recent = measurements.filter(m => (m.takenAt || 0) >= ninetyDaysAgo);
  // Resolve roomId → user-typed room name. Names are no more sensitive
  // than the rest of the always-tier (the user typed them) and turn
  // an opaque "roomId=room_a4b2c8" into "in living-room" — actionable
  // for the AI rather than just identifying.
  const roomNames = new Map();
  for (const r of rooms) {
    if (r && r.id) roomNames.set(r.id, r.name || 'a room');
  }
  const _roomTag = (id) => {
    if (!id) return '';
    const name = roomNames.get(id);
    return ` · in ${name || 'unknown room'}`;
  };
  const warnings = [];
  for (const m of recent) {
    if (m.tool === 'flicker' && Number.isFinite(m.value) && m.value >= 2) {
      warnings.push(`flicker score ${m.value} (visible PWM)${_roomTag(m.roomId)}`);
    } else if (m.tool === 'darkness' && Number.isFinite(m.value) && m.value > 1) {
      warnings.push(`bedroom too bright at the pillow (${m.value.toFixed(1)} lux; WHO threshold for full melatonin = <1 lux)${_roomTag(m.roomId)}`);
    } else if (m.tool === 'cct' && Number.isFinite(m.value) && m.value > 3500) {
      const h = m.takenAt ? new Date(m.takenAt).getHours() : null;
      // Only flag CCT readings taken after sunset (rough proxy: hour ≥ 19).
      if (h != null && h >= 19) {
        warnings.push(`after-sunset CCT ${m.value}K (>3500K = still cool/blue when sun has set)${_roomTag(m.roomId)}`);
      }
    }
  }
  if (warnings.length > 0) {
    s += `- Active light-tool warnings: ${warnings.slice(0, 6).join('; ')}${warnings.length > 6 ? `; +${warnings.length - 6} more` : ''}\n`;
  }
  return s + '\n';
}

function detectDeficits(totals30d) {
  const out = [];
  // Empty channels = clear deficit signal
  if ((totals30d.vitamin_d || 0) === 0) {
    out.push({ label: 'Channel 1 (vit D)', note: 'no UVB exposure logged in 30d — supplement-only path or geographic UVB unavailability' });
  }
  if ((totals30d.circadian || 0) === 0) {
    out.push({ label: 'Channel 5 (circadian)', note: 'no eye-exposure outdoor light logged in 30d — SCN entrainment likely deficient (Hattar/Huberman literature suggests minimum AM dose)' });
  }
  if ((totals30d.nir_solar || 0) === 0) {
    out.push({ label: 'Channel 6 (NIR-solar)', note: 'no broadband NIR logged in 30d — Wunsch/Jeffery optical-tissue-window not active; consider solar exposure or PBM panel' });
  }
  if ((totals30d.no_cv || 0) === 0) {
    out.push({ label: 'Channel 3 (NO/cardiovascular)', note: 'no UVA exposure logged in 30d — Liu/Oplander photolabile NO release pathway not engaged' });
  }
  if ((totals30d.pbm_red || 0) === 0) {
    out.push({ label: 'Channel 7 (PBM red 660nm)', note: 'no narrowband red-light therapy logged in 30d — Hamblin PBM cytochrome-c-oxidase + ATP-cascade pathway not engaged from device sources' });
  }
  if ((totals30d.pbm_nir || 0) === 0) {
    out.push({ label: 'Channel 8 (PBM NIR 810/850nm)', note: 'no narrowband near-IR therapy logged in 30d — deeper-tissue Hamblin PBM not engaged from device sources' });
  }
  return out;
}

// ─── Tier: standard (+1200 tok) ────────────────────────────────────────

function standardTierBlock(sessions) {
  const recent = sessions.filter(s => s.endedAt).slice(-30);
  if (recent.length === 0) return '';

  let block = `### Last ${recent.length} sessions (most recent first)
The "Skin exposed" column is the fraction of total skin uncovered (Wallace rule of nines + Lund-Browder; clothing-level proxy): ~5%=face/hands, ~20%=t-shirt+shorts, ~45%=swimwear/beach, ~50%=fully bare standing facing one way (anterior OR posterior — single position max ~50% BSA). Front+back combined caps at ~95% (the underlying region table sums to 0.95; missing 5% is scalp + clavicle seams). Sessions logged with both sides exposed should also have rotatedSides=true. Treat questions like "how naked was I" or "how dressed" as asking about this column.
Rows where UV peak is 0.0 AND MED% is 0 AND Vit-D is 0 represent sessions logged outside the UVB window — pre-sunrise, post-sunset, or under cloud cover thick enough to block 290–315nm. The duration + body exposure are real (skin contact / circadian eye light still apply); only the UV-driven channels are null. Treat these as "the user was outdoors but UVB-relevant photobiology was off."
| Date | Min | Skin exposed | Regions | Eyes | UV peak | MED% | Vit-D (IU) | Circadian (lux·h) |
|------|-----|--------------|---------|------|---------|------|------------|--------------------|
`;
  for (const sess of recent.slice().reverse()) {
    const date = new Date(sess.startedAt).toISOString().slice(0, 10);
    const dur = Math.round(sess.durationMin || 0);
    const bodyPct = sess.bodyExposure ? Math.round((sess.bodyExposure.fraction || 0) * 100) : 0;
    const regionsStr = _formatRegions(sess.bodyExposure);
    const eyes = sess.eyeExposure?.mode || '?';
    // UV column reflects the session window, not the start-hour stamp.
    // start-hour was misleading: an early-morning logged session showed
    // UV 0 even when its MED% was non-zero because the integrator scanned
    // a different slice of the hourly array than the stamp sampled.
    const uv = _sessionPeakUV(sess);
    const uvFmt = uv != null ? uv.toFixed(1) : '?';
    const med = sess.safety?.medFraction != null ? `${(sess.safety.medFraction * 100).toFixed(0)}` : '?';
    // Vit-D and circadian render in user-meaningful units (IU equivalent
    // and melanopic lux-hours) — the raw channel-au numbers the chat
    // previously rendered ("412,248.5") are opaque and the AI was
    // parroting them in prose. The conversion functions live in
    // sun-spectrum.js with citations; same path as the dashboard.
    const vitDAu = sess.doses?.vitamin_d;
    const _genetics = state.importedData?.genetics || null;
    // Per-session cap with body-fraction scaling (Holick 2008: 1 MED
    // full-body ≈ 10k IU). vitaminDIUPerSession applies both per-session
    // and daily ceilings; vitaminDIU (legacy) applied only the daily.
    const _bodyFrac = sess.bodyExposure?.fraction;
    const vitD = (vitDAu != null && Number.isFinite(vitDAu) && typeof window.vitaminDIUPerSession === 'function')
      ? Math.round(window.vitaminDIUPerSession(vitDAu, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex, !!sess.bodyExposure?.rotatedSides, _genetics, _bodyFrac))
      : '?';
    const circAu = sess.doses?.circadian;
    let circ = '?';
    if (circAu != null && Number.isFinite(circAu) && (sess.durationMin || 0) > 0 && typeof window.circadianMelanopicLux === 'function') {
      const lux = window.circadianMelanopicLux(circAu, sess.durationMin);
      const luxH = lux * ((sess.durationMin || 0) / 60);
      circ = luxH >= 1000 ? Math.round(luxH / 100) * 100 : Math.round(luxH);
    }
    block += `| ${date} | ${dur} | ${bodyPct}% | ${regionsStr} | ${eyes} | ${uvFmt} | ${med} | ${vitD} | ${circ} |\n`;
  }
  block += '\n';

  // PBM / device sessions — surfaced as their own table so the agent can
  // see WHEN device-therapy sessions happened, not just an aggregate count.
  // Skin exposed + body areas honor the same privacy gate as outdoor
  // sessions (regions stripped when the toggle is off).
  const allDevSessions = (state.importedData?.deviceSessions || [])
    .filter(s => s.endedAt)
    .slice(-30);
  if (allDevSessions.length > 0) {
    const deviceById = Object.fromEntries((state.importedData?.lightDevices || []).map(d => [d.id, d]));
    const _genetics = state.importedData?.genetics || null;
    const _fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
    block += `### Last ${allDevSessions.length} device-therapy sessions (PBM panels, SAD lamps, dawn simulators, UVB)\n`;
    // Vit-D IU formula explainer — surfaces the calculation path so the
    // agent can sanity-check the column instead of treating it as a
    // black-box number. Žofka audit 2026-05-08 flagged the 20,000 IU
    // device value as opaque ("real or placeholder?") — answer: it's
    // the Holick 2007 daily saturation cap kicking in. Per-row "capped
    // from X" tag (below) makes that visible inline when raw > cap.
    block += `Vit-D IU formula: vit_d channel-au × 60 (IU/au calibration vs Holick 2008 NEJM + Bogh 2010 JID) × Fitzpatrick scale (I/II=1.0, III=0.85, IV=0.65, V=0.45, VI=0.30) × UVI gate (=1.0 for devices since the device IS the UVB source; ramps 0→1.0 between UVI 2.0–3.0 for outdoor sun) × rotated-sides (×2 if both anatomical sides logged) × genetic VDR/CYP multiplier. Two ceilings layer on top: (1) per-session cap = body_fraction × 30,000 IU — local skin-patch saturation per Holick 2008 ("1 MED full-body ≈ 10,000 IU"; once a region hits ~1 MED of UVB, additional UVB on that region produces no more IU). (2) per-day cap = 20,000 IU — Holick 2007 photoisomerization plateau (pre-D3 reverts to lumisterol/tachysterol above this). Per-session cap binds for high-output device sessions; daily cap binds for very long full-body summer sun. "(capped from X)" annotation on a row means raw computed yield was X but display clamped at the binding ceiling.\n`;
    // Surface the actual computed genetic multiplier + contributing
    // variants so the agent doesn't have to infer it from the formula.
    // Žofka audit 2026-05-08 caught this: the formula line mentions
    // "× genetic VDR/CYP multiplier" but the per-user applied value
    // was opaque. Now: "geneticMult=0.79 (×0.85 rs2282679 TT VDBP, ×0.88
    // rs10741657 GG CYP2R1, …)" so the row math is fully reconstructible.
    let geneticInput = 'geneticMult=1.00 (no genetics loaded)';
    if (typeof window.geneticVitaminDMultiplier === 'function') {
      try {
        const g = window.geneticVitaminDMultiplier(_genetics);
        if (g && Number.isFinite(g.mult)) {
          if (Array.isArray(g.contributors) && g.contributors.length > 0) {
            const parts = g.contributors.map(c => `×${c.multiplier.toFixed(2)} ${c.rsId} ${c.genotype} ${c.gene}`);
            geneticInput = `geneticMult=${g.mult.toFixed(2)} (${parts.join(', ')})`;
          } else {
            geneticInput = `geneticMult=${g.mult.toFixed(2)} (no relevant variants in profile)`;
          }
        }
      } catch (_) {}
    }
    block += `Inputs for this session table: device Fitzpatrick=${_fitzForDevice} (from sunDefaults; devices don't store per-session Fitzpatrick), UVI=null (atmospheric gate bypassed), rotatedSides=false (devices track skin% via bodyAreas), ${geneticInput}.\n\n`;
    block += `| Date | Min | Device | Distance | Skin exposed | Eyes | Vit-D (IU) | Red 660nm (J/cm²) | NIR 810/850 (J/cm²) |\n`;
    block += `|------|-----|--------|----------|--------------|------|------------|-------------------|----------------------|\n`;
    for (const s of allDevSessions.slice().reverse()) {
      const date = new Date(s.startedAt).toISOString().slice(0, 10);
      const dur = Math.round(s.durationMin || 0);
      const dev = deviceById[s.deviceId];
      const devName = dev ? `${dev.brand || '?'} ${dev.model || ''}`.trim() : 'removed device';
      const dist = s.distanceCm ? `${Math.round(s.distanceCm)} cm` : '?';
      // Skin exposed: from bodyAreas if precise (post-2026-05-08), else
      // from legacy bodyArea broad-zone string. Keep both the display
      // string AND the underlying fraction — the per-session vit-D cap
      // needs the fraction to apply Holick's MED-saturation ceiling.
      let bodyPct = '?';
      let bodyFrac = null;
      if (Array.isArray(s.bodyAreas) && s.bodyAreas.length > 0) {
        const fracByKey = (typeof window !== 'undefined' && window.BODY_REGIONS)
          ? Object.fromEntries(window.BODY_REGIONS.map(r => [r.key, r.fraction]))
          : {};
        const total = s.bodyAreas.reduce((acc, k) => acc + (fracByKey[k] || 0), 0);
        bodyFrac = total;
        bodyPct = `${Math.round(total * 100)}%`;
      } else if (s.bodyArea) {
        const broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
        const f = broadFracs[s.bodyArea];
        if (f != null) {
          bodyFrac = f;
          bodyPct = `${Math.round(f * 100)}%`;
        } else {
          bodyPct = s.bodyArea;
        }
      }
      const eyes = s.eyesProtected ? 'protected' : 'uncovered';
      // Vit-D IU + cap-detection: compute raw uncapped IU and capped IU
      // separately so we can append "(capped from N)" inline when the
      // saturation ceiling fired. Agent-readable transparency: instead
      // of a flat "20000" the row reads "20000 (capped from ~23,940)"
      // — the agent knows the device math actually produced more than
      // the biological ceiling. Falls back to '—' when the device emits
      // no UVB (red/NIR-only panels) so the column doesn't look broken.
      const vitDAu = s.doses?.vitamin_d;
      let vitD = '—';
      if (vitDAu != null && Number.isFinite(vitDAu) && vitDAu > 0 && typeof window.vitaminDIUPerSession === 'function') {
        const capped = Math.round(window.vitaminDIUPerSession(vitDAu, _fitzForDevice, null, false, _genetics, bodyFrac));
        const raw = (typeof window.vitaminDIURaw === 'function')
          ? Math.round(window.vitaminDIURaw(vitDAu, _fitzForDevice, null, false, _genetics))
          : capped;
        vitD = (raw > capped) ? `${capped} (capped from ~${raw.toLocaleString()})` : `${capped}`;
      }
      const red = s.doses?.pbm_red != null ? (s.doses.pbm_red / 1000).toFixed(2) : '?';
      const nir = s.doses?.pbm_nir != null ? (s.doses.pbm_nir / 1000).toFixed(2) : '?';
      block += `| ${date} | ${dur} | ${devName} | ${dist} | ${bodyPct} | ${eyes} | ${vitD} | ${red} | ${nir} |\n`;
    }
    block += '\n';
  }

  // Correlation table — computed on demand by sun-correlations.js
  let corr = state.importedData?.sunCorrelations;
  if (!corr || !corr.pairs) {
    try { corr = getSunCorrelations(); } catch (e) {
      if (window.isDebugMode && window.isDebugMode()) console.warn('[sun-context] getSunCorrelations failed', e);
    }
  }
  if (corr && corr.pairs) {
    block += `### Sun-channel × biomarker correlations (computed from your data)
${formatCorrelations(corr.pairs)}

`;
  }

  return block;
}

// Compact representation of bodyExposure for the standard-tier session
// table. Quick presets render as their key (face_hands / tshirt /
// swimwear / sunbathing); detailed logs render the actual region keys
// joined with '+' so the AI can see specific anatomical areas (e.g.
// `genitals+breast-chest+legs-front`). `(both)` suffix denotes
// rotatedSides — both anterior and posterior were exposed during the
// session via the in-session 🔄 Flip control.
//
// Body regions are gated on the per-profile consent flag
// (isBodyRegionsInAIContext, default OFF). When disabled the column
// renders preset/dash only — preserving total-fraction signal at the
// row's `bodyPct` column without exfiltrating anatomy.
function _formatRegions(bodyExposure) {
  if (!bodyExposure) return '?';
  const preset = bodyExposure.preset;
  const regions = Array.isArray(bodyExposure.regions) ? bodyExposure.regions : [];
  const rot = bodyExposure.rotatedSides ? ' (both)' : '';
  if (regions.length === 0 || !isBodyRegionsInAIContext()) {
    return (preset && preset !== 'detailed') ? `${preset}${rot}` : `—${rot}`;
  }
  return regions.join('+') + rot;
}

// ─── Tool-call APIs (replaces former deep-tier prompt block) ──────────
//
// Per-session detail belongs in a tool response, not a prompt. These
// functions are the single source of truth for chat tool-calls AND
// the MCP/agent path — the agent can pull the same data without us
// inflating every prompt with sessions it might not need.

const _SLICE_DEFAULT_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere', 'body'];
const _SLICE_ALL_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere', 'body', 'eyes', 'location', 'notes'];

// Project a sun session to a canonical, cap-bounded shape. `fields`
// gates each section so callers (especially the agent) can ask for
// just the columns they need. `body` is in the default set so the AI
// can reason about coverage fraction + sunscreen + glass-between without
// the user opting in — but the specific anatomical `regions` array is
// stripped from the projected body unless the per-profile consent flag
// (isBodyRegionsInAIContext) is set, even when `body` is requested.
// `location` (sub-11km coords) still stays off by default.
function _projectSession(sess, fields) {
  const out = {};
  if (fields.includes('date') && sess.startedAt) {
    out.date = new Date(sess.startedAt).toISOString().slice(0, 10);
  }
  if (fields.includes('duration')) {
    out.durationMin = Math.round(sess.durationMin || 0);
  }
  if (fields.includes('channels') && sess.doses) {
    out.channels = {};
    for (const [k, v] of Object.entries(sess.doses)) {
      out.channels[k] = Math.round(v * 10) / 10;
    }
  }
  if (fields.includes('safety') && sess.safety) {
    const s = sess.safety;
    out.safety = {
      sed: s.sed != null ? +s.sed.toFixed(2) : null,
      medFraction: s.medFraction != null ? +s.medFraction.toFixed(2) : null,
      fitzpatrick: s.fitzpatrick || null,
      retinalUV: s.retinalUV != null ? +s.retinalUV.toFixed(1) : null,
    };
  }
  if (fields.includes('atmosphere') && sess.atmosphere) {
    const a = sess.atmosphere;
    out.atmosphere = {
      uvIndex: a.uvIndex != null ? +a.uvIndex.toFixed(1) : null,
      ozoneDU: a.ozoneDU || null,
      cloudCover: a.cloudCover != null ? a.cloudCover : null,
      temperatureC: a.temperatureC != null ? Math.round(a.temperatureC) : null,
      source: a.source || null,
      confidence: a.confidence != null ? +a.confidence.toFixed(2) : null,
    };
  }
  if (fields.includes('body') && sess.bodyExposure) {
    const b = sess.bodyExposure;
    // Gate the regions[] array on the per-profile consent flag — preset +
    // fraction + sunscreen still flow so the AI can reason about coverage,
    // but the specific anatomy stays local until the user opts in.
    const includeRegions = isBodyRegionsInAIContext();
    out.body = {
      preset: b.preset || null,
      fraction: b.fraction != null ? +b.fraction.toFixed(2) : null,
      regions: includeRegions && Array.isArray(b.regions) ? b.regions.slice() : [],
      sunscreenSPF: b.sunscreenSPF || null,
      glassBetween: !!b.glassBetween,
    };
  }
  if (fields.includes('eyes') && sess.eyeExposure) {
    const e = sess.eyeExposure;
    out.eyes = {
      mode: e.mode || null,
      lensTint: e.lensTint || 'clear',
      durationSec: e.durationSec || 0,
    };
  }
  if (fields.includes('location') && sess.location) {
    // Honor the user's network privacyRounding setting; default to 0.01°.
    let p = 0.01;
    try { p = (window.getMeteoConfig && window.getMeteoConfig().privacyRounding) || 0.01; } catch (e) {
      if (window.isDebugMode && window.isDebugMode()) console.warn('[sun-context] getMeteoConfig failed', e);
    }
    const f = 1 / p;
    out.location = {
      lat: Math.round(sess.location.lat * f) / f,
      lon: Math.round(sess.location.lon * f) / f,
      altitudeM: sess.location.altitudeM || 0,
      privacyRoundingDeg: p,
    };
  }
  if (fields.includes('notes') && sess.notes) out.notes = sess.notes;
  return out;
}

// Agent-callable. Returns a JSON-serialisable array of recent sun
// sessions, projected to the requested fields, capped at `days` (max 90).
// Default field set includes body summary (preset/fraction/sunscreen) but
// strips the regions[] array unless the per-profile consent flag is set
// (isBodyRegionsInAIContext). Location stays off by default.
export function getSunSessionsSlice({ days = 30, fields, includeActive = false } = {}) {
  const sessions = state.importedData?.sunSessions || [];
  if (sessions.length === 0) return [];
  const cap = Math.max(1, Math.min(90, Math.floor(days)));
  const cutoff = Date.now() - cap * 86400 * 1000;
  let f = Array.isArray(fields) && fields.length > 0
    ? fields.filter(x => _SLICE_ALL_FIELDS.includes(x))
    : _SLICE_DEFAULT_FIELDS.slice();
  if (f.length === 0) f = _SLICE_DEFAULT_FIELDS.slice();
  const out = [];
  for (const sess of sessions) {
    if (!sess.startedAt || sess.startedAt < cutoff) continue;
    if (!includeActive && !sess.endedAt) continue;
    const proj = _projectSession(sess, f);
    proj.id = sess.id;
    out.push(proj);
  }
  // Most recent first — matches every other Light & Sun list ordering.
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}

// Agent-callable. Returns a single session by id, projected to the
// full field set (caller already named the row, so we serve everything
// we have on it). Returns null when not found.
export function getSunSessionDetail(id) {
  const sessions = state.importedData?.sunSessions || [];
  const sess = sessions.find(s => s.id === id);
  if (!sess) return null;
  const proj = _projectSession(sess, _SLICE_ALL_FIELDS);
  proj.id = sess.id;
  return proj;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const CHANNEL_LABELS = {
  vitamin_d:  'Vit-D synthesis',
  pomc:       'POMC/melanocortin',
  no_cv:      'NO/cardiovascular',
  violet_eye: 'Violet/outdoor-eye',
  circadian:  'Circadian (melanopic)',
  nir_solar:  'NIR-solar broadband',
  pbm_red:    'PBM red',
  pbm_nir:    'PBM near-IR',
};

// 7-day rollup in user-meaningful units rather than opaque channel-au.
// `channel-au` is fine for correlations + tier math, but the AI was
// reporting raw numbers ("Vit-D synthesis: 104", "Circadian: 1,005,928")
// that don't ground to anything users can act on. This translates each
// channel to its native unit + a tier label (none/low/moderate/good/strong)
// against the literature-derived weekly target (= 7 × dailyTarget).
//
// Conventions per channel:
//   vitamin_d: sum of per-session IU equivalents (Holick + Fitzpatrick gating)
//   circadian: sum of melanopic lux·hours at the eye
//   nir_solar / pbm_red / pbm_nir: sum of J/cm²
//   pomc / no_cv / violet_eye: tier label only (no defensible single SI unit)
//
// `totals` carries the channel-au sums for tier classification; per-unit
// rollups walk `sessions` directly so UVI gating + Fitzpatrick scaling +
// saturation caps apply per-session (they're non-linear, can't post-hoc).
function formatChannelTotals(totals) {
  // Targets are daily; rolling window is 7d, so weekly target is ×7. Use
  // the canonical weeklyChannelTier so the AI rollup, the dashboard
  // strip, and the per-channel drill-down all agree.
  const tierLabel = window.tierLabel || ((t) => ['none','low','moderate','good','strong'][t] || 'none');
  const channelTier = window.weeklyChannelTier || ((v, k) => {
    const meta = (window.CHANNEL_DISPLAY || {})[k];
    if (!meta || !meta.dailyTarget) return 0;
    const target = meta.dailyTarget * 7;
    if (!Number.isFinite(v) || v <= 0) return 0;
    const r = v / target;
    if (r < 0.20) return 1;
    if (r < 0.55) return 2;
    if (r < 1.00) return 3;
    return 4;
  });

  // Per-unit rollup helpers. Walk recent sessions/devices in window so
  // per-session conversions (UVI gate, Fitzpatrick, IU saturation) apply
  // correctly. Sum afterwards rather than scaling the channel-au total.
  const cutoff = Date.now() - 7 * 86400 * 1000;
  const sunSessions = (state.importedData?.sunSessions || []).filter(s => s.endedAt && s.endedAt >= cutoff);
  const deviceSessions = (state.importedData?.deviceSessions || []).filter(s => s.endedAt && s.endedAt >= cutoff);

  // Three-cap rollup (matches rollingVitaminDIU in sun.js): per-session
  // body-fraction cap → per-day saturation cap → sum capped days. Both
  // functions are user-visible 7-day totals and must agree.
  const _gx = state.importedData?.genetics || null;
  const _perSession = (typeof window !== 'undefined' && typeof window.vitaminDIUPerSession === 'function') ? window.vitaminDIUPerSession : null;
  const _cap = (typeof window !== 'undefined' && Number.isFinite(window.VITD_DAILY_SATURATION_IU)) ? window.VITD_DAILY_SATURATION_IU : 20000;
  const _localDayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const _dayTotals = {};
  const _add = (key, iu) => { _dayTotals[key] = (_dayTotals[key] || 0) + iu; };
  for (const s of sunSessions) {
    const au = s.doses?.vitamin_d;
    if (!Number.isFinite(au) || au <= 0) continue;
    const _bodyFrac = s.bodyExposure?.fraction;
    if (_perSession) {
      _add(_localDayKey(s.endedAt), _perSession(au, s.safety?.fitzpatrick || 'III', s.atmosphere?.uvIndex, !!s.bodyExposure?.rotatedSides, _gx, _bodyFrac));
    } else {
      _add(_localDayKey(s.endedAt), au * 60);
    }
  }
  // UVB device sessions. uvi=null (device IS the UVB source);
  // rotatedSides=false (devices track skin% on bodyAreas, not anatomical sides).
  const _fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const _fracByKey = (typeof window !== 'undefined' && window.BODY_REGIONS)
    ? Object.fromEntries(window.BODY_REGIONS.map(r => [r.key, r.fraction]))
    : {};
  const _broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
  for (const s of deviceSessions) {
    const au = s.doses?.vitamin_d;
    if (!Number.isFinite(au) || au <= 0) continue;
    let _bodyFrac = null;
    if (Array.isArray(s.bodyAreas) && s.bodyAreas.length > 0) {
      _bodyFrac = s.bodyAreas.reduce((acc, k) => acc + (_fracByKey[k] || 0), 0);
    } else if (s.bodyArea) {
      _bodyFrac = _broadFracs[s.bodyArea] ?? null;
    }
    if (_perSession) {
      _add(_localDayKey(s.endedAt), _perSession(au, _fitzForDevice, null, false, _gx, _bodyFrac));
    } else {
      _add(_localDayKey(s.endedAt), au * 60);
    }
  }
  let totalIU = 0;
  for (const iu of Object.values(_dayTotals)) totalIU += Math.min(iu, _cap);

  let totalLuxHours = 0;
  for (const s of [...sunSessions, ...deviceSessions]) {
    const au = s.doses?.circadian;
    const dur = s.durationMin || 0;
    if (!Number.isFinite(au) || au <= 0 || dur <= 0) continue;
    if (typeof window.circadianMelanopicLux === 'function') {
      const lux = window.circadianMelanopicLux(au, dur);
      totalLuxHours += lux * (dur / 60);
    }
  }

  const pbmJ = (k) => {
    let j = 0;
    for (const s of [...sunSessions, ...deviceSessions]) {
      const au = s.doses?.[k];
      if (!Number.isFinite(au) || au <= 0) continue;
      j += typeof window.pbmJoulesPerCm2 === 'function' ? window.pbmJoulesPerCm2(au) : au / 10000;
    }
    return j;
  };
  const totalNirJ = pbmJ('nir_solar');
  const totalRedJ = pbmJ('pbm_red');
  const totalNirPbmJ = pbmJ('pbm_nir');

  const fmtIU = (n) => n >= 1000 ? `~${(Math.round(n / 100) * 100).toLocaleString()} IU` : `~${Math.round(n / 10) * 10} IU`;
  const fmtLuxH = (n) => n >= 1000 ? `~${(Math.round(n / 100) * 100).toLocaleString()} lux·h` : `~${Math.round(n)} lux·h`;
  const fmtJ = (n) => n >= 10 ? `${Math.round(n)} J/cm²` : n >= 1 ? `${n.toFixed(1)} J/cm²` : `${n.toFixed(2)} J/cm²`;
  const tier = (k) => {
    const t = channelTier(totals[k] || 0, k);
    return `${tierLabel(t)}`;
  };
  const dot = (k) => {
    const t = channelTier(totals[k] || 0, k);
    return ['○○○○','●○○○','●●○○','●●●○','●●●●'][t] || '○○○○';
  };

  // Channel labels are source-agnostic. `pbm_red` and `pbm_nir`
  // accumulate from both sun (broadband solar contains red + near-IR)
  // and therapy panels — calling them "therapy" was misleading when
  // the user has logged sun but no devices.
  const rows = [
    `- Vitamin D synthesis: ${tier('vitamin_d')} ${dot('vitamin_d')} (${totalIU > 0 ? fmtIU(totalIU) : 'none'})`,
    `- Mood & hormones (POMC / β-endorphin): ${tier('pomc')} ${dot('pomc')}`,
    `- Cardiovascular (UVA / nitric oxide): ${tier('no_cv')} ${dot('no_cv')}`,
    `- Outdoor eye light (violet / UV-A at the eye): ${tier('violet_eye')} ${dot('violet_eye')}`,
    `- Body clock (melanopic light at the eye): ${tier('circadian')} ${dot('circadian')} (${totalLuxHours > 0 ? fmtLuxH(totalLuxHours) : 'none'})`,
    `- Cellular repair (broadband near-IR, 600-1400nm): ${tier('nir_solar')} ${dot('nir_solar')} (${totalNirJ > 0 ? fmtJ(totalNirJ) : 'none'})`,
    `- Red wavelengths (~660nm, sun + any panels): ${tier('pbm_red')} ${dot('pbm_red')} (${totalRedJ > 0 ? fmtJ(totalRedJ) : 'none'})`,
    `- Near-IR wavelengths (~810/850nm, sun + any panels): ${tier('pbm_nir')} ${dot('pbm_nir')} (${totalNirPbmJ > 0 ? fmtJ(totalNirPbmJ) : 'none'})`,
  ];
  return rows.join('\n');
}

function formatCorrelations(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return '_no correlations computed yet_';
  // pairs: [{ channel, biomarker, r, n, p, lag }]
  const sig = pairs.filter(p => p.n >= 14 && Math.abs(p.r) >= 0.3);
  if (sig.length === 0) return '_no significant correlations (n≥14, |r|≥0.3) yet_';
  const lines = ['| Channel | Biomarker | r | n | lag |', '|---------|-----------|---|---|-----|'];
  for (const p of sig.slice(0, 12)) {
    lines.push(`| ${CHANNEL_LABELS[p.channel] || p.channel} | ${p.biomarker} | ${p.r.toFixed(2)} | ${p.n} | ${p.lag || 0}d |`);
  }
  return lines.join('\n');
}

// Peak UV during the session window. Walks the persisted hourly array
// and picks the max within [startedAt, endedAt]. Falls back to the
// stored start-hour stamp when hourly isn't present (older records,
// manual atmosphere entries). Returns null when nothing usable exists.
function _sessionPeakUV(sess) {
  const atm = sess.atmosphere;
  if (!atm) return null;
  const start = sess.startedAt, end = sess.endedAt || sess.startedAt;
  const hourly = atm.hourly;
  if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.uv_index)) {
    const offsetS = Number.isFinite(hourly.utcOffsetSeconds) ? hourly.utcOffsetSeconds : 0;
    let peak = -Infinity;
    for (let i = 0; i < hourly.time.length; i++) {
      const t = hourly.time[i];
      if (typeof t !== 'string') continue;
      // Hourly times are local-clock at the location; reverse the offset
      // to compare against epoch-ms session bounds.
      const ms = Date.parse(t.length === 16 ? t + 'Z' : t);
      if (!Number.isFinite(ms)) continue;
      const epoch = ms - offsetS * 1000;
      if (epoch < start - 30 * 60 * 1000) continue;
      if (epoch > end + 30 * 60 * 1000) continue;
      const v = hourly.uv_index[i];
      if (Number.isFinite(v) && v > peak) peak = v;
    }
    if (peak > -Infinity) return peak;
  }
  return Number.isFinite(atm.uvIndex) ? atm.uvIndex : null;
}

function mergeTotalsCtx(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}

function formatRelative(ts) {
  if (!ts) return '?';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    buildSunContext,
    getSunSessionsSlice,
    getSunSessionDetail,
    isBodyRegionsInAIContext,
    setBodyRegionsInAIContext,
  });
}
