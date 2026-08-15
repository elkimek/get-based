// @ts-check
// sun-context.js — buildSunContext({ tier }) for AI integration.
// Two-tier prompt blob; per-session detail moved to a tool-call API.
//
//   tier: 'always'   ~520 tok — Lifelight summary + 7d source signals
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
import {
  sunContextDeps,
  _bodyRegionFractionByKey,
  _debugWarn,
  _safeText,
} from './sun-context-runtime.js';
import { lightEnvironmentBlock } from './sun-context-environment.js';
import { isLightSunContextEnabled } from './lab-context.js';

export { configureSunContext } from './sun-context-runtime.js';
export { getSunSessionsSlice, getSunSessionDetail } from './sun-context-session-tools.js';

// ═══════════════════════════════════════════════
// BODY REGIONS IN AI CONTEXT (per-profile, default OFF)
// ═══════════════════════════════════════════════
// Legacy per-profile body-region preference. Context management now treats
// body-region detail as part of Light & Sun, so AI projection follows the
// Light & Sun source toggle instead. Keep these exports for older stored
// preferences and tests that still call the public API.
function _bodyRegionsCtxKey() {
  const pid = localStorage.getItem('labcharts-active-profile') || 'default';
  return `labcharts-${pid}-ai-include-body-regions`;
}
export function isBodyRegionsInAIContext() {
  return localStorage.getItem(_bodyRegionsCtxKey()) === 'on';
}
export function setBodyRegionsInAIContext(on) {
  localStorage.setItem(_bodyRegionsCtxKey(), on ? 'on' : 'off');
  sunContextDeps.invalidateLabContextCache?.();
}

// ─── Public API ────────────────────────────────────────────────────────

export function buildSunContext({ tier = 'always', ignoreContextToggles = false } = {}) {
  if (!ignoreContextToggles && !isLightSunContextEnabled()) return '';
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
  // API in https://docs.getbased.health/guides/agent-access. The block actually contains sun
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
  // HARD bumped 5500 → 8500 in 2026-05-08 (round 4): standard tier
  // grew with the device-IU formula explainer + genetic-mult inputs +
  // per-session cap docs (each ~500 chars). A populated user with
  // ~5 device sessions + indoor env + calibration could exceed 5500
  // and trigger the aggressive trim, which dropped indoor env entirely.
  // Indoor env (8-14 h/day exposure block) and device-table formula
  // transparency are both keep-at-all-costs. With 1M context we can
  // afford 8.5k chars for [section:sun]; the cap mainly prevents
  // runaway prompts under unexpected data shapes.
  const SOFT = 3500, HARD = 8500;
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
  ctx = ctx.replace(/(### Light audits[^\n]*\n(?:[^\n]*\n)*?  - [^\n]*\n(?:    · [^\n]*\n)*)([\s\S]*?)(?=\n[A-Z]|\n\[|\n###|$)/, (_match, kept, _rest) => {
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
  // Keep sunlight and devices separate. These totals describe recorded light
  // inputs, not biological completion or a single combined light score.
  const sunTot7 = (typeof sunContextDeps.rollingChannelTotals === 'function' ? sunContextDeps.rollingChannelTotals(7) : null) || {};
  const devTot7 = (typeof sunContextDeps.rollingDeviceTotals === 'function' ? sunContextDeps.rollingDeviceTotals(7) : null) || {};
  const medToday = typeof sunContextDeps.cumulativeMEDToday === 'function' ? sunContextDeps.cumulativeMEDToday() : 0;
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
      baselineLine += ` Ott self-survey: ${10 - sunDefaults.ottScore}/10 aligned.`;
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
        return `  - ${_safeText(d.brand) || '?'} ${_safeText(d.model) || '?'} (${_safeText(d.type, 32) || 'device'}, ${peaks}, ${irr})`;
      }).join('\n')
    : '';

  // Active session + most-recent session lines drop when null. The short
  // source summary deliberately avoids grades and targets; missing logs are
  // a measurement gap, not proof of missing biology.
  let block = `### Lifelight summary
- Outdoor sessions: ${sessions.length} · device sessions: ${devSessions.length} · devices in library: ${devices.length}${baselineLine}${deviceListLine}
- Today's modeled erythemal dose: ${(medToday * 100).toFixed(0)}% of a Fitzpatrick base MED reference (not a personal threshold; sunscreen is not credited as extra safe time)${medToday > 1 ? ' (base MED reached — stop UV exposure)' : ''}
${activeSession ? `- ACTIVE SESSION in progress (started ${formatRelative(activeSession.startedAt)})\n` : ''}${lastSession ? `- Most recent outdoor session: ${formatRelative(lastSession.endedAt)} (${Math.round(lastSession.durationMin || 0)} min)\n` : ''}
### Light-responsive signals — last 7 days
- Sunlight: ${formatLoggedSignals(sunTot7)}
- Devices, kept separate: ${formatLoggedSignals(devTot7)}
- These are recorded light inputs, not daily requirements or measured body responses.

`;

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

// ─── Tier: standard ────────────────────────────────────────────────────
//
// Pre-2026-05-10: emitted per-session tables for outdoor sun (last 30) +
// device-therapy (last 30) — ~1,000–2,000 chars per chat turn for active
// users, mostly unused (the AI rarely cited a specific session by date,
// it leaned on the always-tier rollup). Wearables solved the same
// problem with `summary.metrics[mid].weekly` arrays + last-5 anomalies
// from changeHistory; sun was the outlier paying tokens for per-event
// detail every chat.
//
// Now: weekly trend (last 6w per channel) for the shape signal — same
// pattern as `buildWearableContext`'s "Weekly trend (last 6w)" block.
// Per-session forensics moves to the existing tool-call APIs
// (`getSunSessionDetail(id)`, `getSunSessionsSlice(opts)`); the AI
// reaches them when the user asks about a specific session, instead of
// loading every session into every prompt. Net savings on a typical
// active user: ~1,200–1,500 chars (~300–375 tok) per chat turn.

function standardTierBlock(sessions) {
  const sun = sessions.filter(s => s.endedAt);
  const dev = (state.importedData?.deviceSessions || []).filter(s => s.endedAt);
  if (sun.length === 0 && dev.length === 0) {
    // No session history — just the correlation table if any (rare).
    return _correlationsBlock();
  }

  // 6-week trend per channel. Keep outdoor and device records in separate
  // buckets so a targeted device never reads as full-spectrum sunlight.
  const WEEKS = 6;
  const now = Date.now();
  const channels = ['vitamin_d', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir', 'no_cv', 'pomc'];
  const makeBuckets = () => Object.fromEntries(channels.map(k => [k, new Array(WEEKS).fill(0)]));
  const sunBuckets = makeBuckets();
  const deviceBuckets = makeBuckets();
  // Same per-session cap path the always-tier 7d rollup uses, so the
  // weekly trend integrates correctly for high-output device sessions
  // (without this, raw channel-au sums to nonsense for vit-D).
  const _genetics = state.importedData?.genetics || null;
  const _fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const _perSession = typeof sunContextDeps.vitaminDIUPerSession === 'function' ? sunContextDeps.vitaminDIUPerSession : null;
  const _fracByKey = _bodyRegionFractionByKey();
  const _broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
  const _devBodyFrac = (s) => {
    if (Array.isArray(s.bodyAreas) && s.bodyAreas.length > 0) {
      return s.bodyAreas.reduce((acc, k) => acc + (_fracByKey[k] || 0), 0) || null;
    }
    return s.bodyArea ? (_broadFracs[s.bodyArea] ?? null) : null;
  };
  const addSessions = (sourceSessions, buckets, isSun) => {
    for (const s of sourceSessions) {
      const weekIdx = Math.floor((now - s.endedAt) / (7 * 86400 * 1000));
      if (weekIdx < 0 || weekIdx >= WEEKS) continue;
      const slot = WEEKS - 1 - weekIdx;
      const fitz = isSun ? (s.safety?.fitzpatrick || 'III') : _fitzForDevice;
      const uvi = isSun ? s.atmosphere?.uvIndex : null;
      const rotated = isSun && !!s.bodyExposure?.rotatedSides;
      const bf = isSun ? s.bodyExposure?.fraction : _devBodyFrac(s);
      for (const k of channels) {
        const au = s.doses?.[k];
        if (!Number.isFinite(au) || au <= 0) continue;
        if (k === 'vitamin_d' && _perSession) {
          buckets[k][slot] += _perSession(au, fitz, uvi, rotated, _genetics, bf);
        } else {
          buckets[k][slot] += au;
        }
      }
    }
  };
  addSessions(sun, sunBuckets, true);
  addSessions(dev, deviceBuckets, false);

  // Render: only emit channels with non-zero buckets so empty channels
  // don't bloat the block. Format depends on channel: IU for vit-D,
  // lux·h for circadian, J/cm² for the three PBM-band channels, raw
  // channel-au for no_cv and pomc (no canonical SI unit — the AI sees
  // the trend shape, not magnitude).
  const fmtIUCompact = (n) => n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  const fmtJ = (n) => n >= 10 ? `${Math.round(n)}` : n >= 1 ? n.toFixed(1) : n.toFixed(2);
  const _luxHFromAu = (weeklyAu) => {
    // circadian channel-au needs duration to convert; bucket totals are
    // au-aggregates not lux-h. Approximation: use the always-tier helper
    // pattern but on a representative 1-hour basis. The AI cares about
    // shape week-to-week, not absolute lux-h here (always-tier already
    // shows the absolute 7d total).
    if (typeof sunContextDeps.circadianMelanopicLux === 'function') {
      return Math.round(sunContextDeps.circadianMelanopicLux(weeklyAu, 60) * 1); // 60-min basis
    }
    return Math.round(weeklyAu);
  };
  const labels = {
    vitamin_d: 'Vit-D (IU)',
    circadian: 'Body clock (lux·h)',
    nir_solar: 'Cell energy & repair (J/cm²)',
    pbm_red: 'Red 660nm (J/cm²)',
    pbm_nir: 'NIR 810/850 (J/cm²)',
    no_cv: 'Cardiovascular (au)',
    pomc: 'Mood/hormones (au)',
  };
  const renderBucketLines = (buckets) => {
    const lines = [];
    for (const k of channels) {
      const b = buckets[k];
      if (b.every(v => v === 0)) continue;
      let formatted;
      if (k === 'vitamin_d') {
        formatted = b.map(v => v > 0 ? fmtIUCompact(v) : '0').join('→');
      } else if (k === 'circadian') {
        formatted = b.map(v => v > 0 ? fmtIUCompact(_luxHFromAu(v)) : '0').join('→');
      } else if (k === 'nir_solar' || k === 'pbm_red' || k === 'pbm_nir') {
        formatted = b.map(v => {
          if (v <= 0) return '0';
          const j = typeof sunContextDeps.pbmJoulesPerCm2 === 'function' ? sunContextDeps.pbmJoulesPerCm2(v) : v / 10000;
          return fmtJ(j);
        }).join('→');
      } else {
        formatted = b.map(v => v > 0 ? fmtIUCompact(v) : '0').join('→');
      }
      lines.push(`  ${labels[k]}: ${formatted}`);
    }
    return lines;
  };
  const sunLines = renderBucketLines(sunBuckets);
  const deviceLines = renderBucketLines(deviceBuckets);

  let block = '';
  if (sunLines.length > 0 || deviceLines.length > 0) {
    block += '### Weekly light trend (last 6w, oldest→newest; sources kept separate)\n';
    if (sunLines.length > 0) block += `Sunlight:\n${sunLines.join('\n')}\n`;
    if (deviceLines.length > 0) block += `Devices:\n${deviceLines.join('\n')}\n`;
    block += '\n';
  }

  // Session counts — the only per-event detail the always-on payload
  // carries. Wearables doesn't have an event-count analog (each metric
  // is sampled continuously); for sun, the session count is the rate
  // signal the AI uses for cadence reasoning ("you logged 2 sessions
  // this week vs 5 the prior week"). One line, both kinds.
  const _last7d = now - 7 * 86400 * 1000;
  const _prior7d = now - 14 * 86400 * 1000;
  const sun7 = sun.filter(s => s.endedAt >= _last7d).length;
  const sunPrev7 = sun.filter(s => s.endedAt >= _prior7d && s.endedAt < _last7d).length;
  const dev7 = dev.filter(s => s.endedAt >= _last7d).length;
  const devPrev7 = dev.filter(s => s.endedAt >= _prior7d && s.endedAt < _last7d).length;
  if (sun7 + dev7 + sunPrev7 + devPrev7 > 0) {
    block += `### Session cadence\n- Last 7d: ${sun7} outdoor + ${dev7} device (prior 7d: ${sunPrev7} outdoor + ${devPrev7} device)\n- Per-session detail: agent can call \`getSunSessionsSlice({days: 30})\` or \`getSunSessionDetail(id)\` for forensics\n\n`;
  }

  block += _correlationsBlock();
  return block;
}

// Correlation table is already aggregate (per-channel × per-biomarker
// Pearson over 12-week rolling windows). Kept as-is — it's the highest-
// signal block for cross-lens reasoning and it's already lean.
function _correlationsBlock() {
  let corr = state.importedData?.sunCorrelations;
  if (!corr || !corr.pairs) {
    try { corr = getSunCorrelations(); } catch (e) {
      _debugWarn('[sun-context] getSunCorrelations failed', e);
    }
  }
  if (corr && corr.pairs) {
    return `### Sun-channel × biomarker correlations (computed from your data)\n${formatCorrelations(corr.pairs)}\n\n`;
  }
  return '';
}

// ─── Helpers ───────────────────────────────────────────────────────────

const CHANNEL_LABELS = {
  vitamin_d:  'Vit-D synthesis',
  pomc:       'POMC/melanocortin',
  no_cv:      'NO/cardiovascular',
  violet_eye: 'Violet/outdoor-eye',
  circadian:  'Circadian (melanopic)',
  nir_solar:  'Cell energy & repair',
  pbm_red:    'PBM red',
  pbm_nir:    'PBM near-IR',
};

function formatLoggedSignals(totals) {
  const labels = [];
  for (const [key, label] of Object.entries(CHANNEL_LABELS)) {
    if (Number.isFinite(totals?.[key]) && totals[key] > 0) labels.push(label);
  }
  return labels.length > 0 ? `${labels.join(', ')} logged` : 'no signals logged';
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
