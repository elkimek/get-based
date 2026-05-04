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

  let ctx = '[section:sunSessions]\n## Light & Sun lens\n\n';
  ctx += alwaysTierBlock(sessions);

  if (tier === 'standard' || tier === 'deep') {
    ctx += standardTierBlock(sessions);
  }

  ctx += '[/section:sunSessions]\n\n';

  // Runtime token-budget guard. The always-tier in the canonical case is
  // ~1400 chars (~520 tok). A heavy user with full env + many warnings +
  // calibration line + several active deficits can push toward 3000+.
  // We escalate trimming in two stages:
  //   • soft cap (2500 chars) → drop the calibration line and trim the
  //     warnings list to the first 3 entries
  //   • hard cap (4000 chars) → also drop the indoor-environment block's
  //     deficit-axes detail and the burden-axes line
  // Standard tier is allowed past the soft cap (it's keyword-triggered
  // and the user explicitly asked for sun context); only the hard cap
  // applies there.
  const SOFT = 2500, HARD = 4000;
  if (tier === 'always' && ctx.length > SOFT) {
    ctx = _trimToBudget(ctx, SOFT);
  }
  if (ctx.length > HARD) {
    ctx = _trimToBudget(ctx, HARD, /* aggressive */ true);
  }
  return ctx;
}

// Stepwise drop sections until the blob fits the budget. Order is least-
// loss first: calibration anchor → warnings overflow → deficit-axes →
// indoor environment as a whole. Each drop replaces a section in-place
// rather than re-serializing — cheap, idempotent, and the section
// markers are stable matchers.
function _trimToBudget(ctx, budget, aggressive = false) {
  if (ctx.length <= budget) return ctx;

  // 1. Drop the calibration anchor block.
  ctx = ctx.replace(/\n### Calibration anchor[\s\S]*?(?=\n###|\n\[\/section)/, '');
  if (ctx.length <= budget) return ctx;

  // 2. Trim "Active light-tool warnings" list to first 3 (was 6).
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

  if (aggressive) {
    // 4. Hard-cap fallback: drop the entire indoor-environment block.
    ctx = ctx.replace(/\n### Indoor light environment[\s\S]*?(?=\n###|\n\[\/section)/, '');
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
    if (typeof sunDefaults.ottScore === 'number') {
      baselineLine += ` Ott malillumination baseline: ${sunDefaults.ottScore}/10 (higher = more indoor / glass-mediated / artificial-light-dominated lifestyle).`;
    }
  }

  // Compact lifelight summary — counts only, no device-name listing (the AI
  // doesn't need to know "Joovv Mini 3.0" by brand to reason about red-light
  // dose; the channel totals already encode the bioactive signal). Active
  // session + most-recent session lines drop when null. Verbose 30-day
  // channel totals were dropped from always-tier output — they're computed
  // for deficit detection but the 7-day totals are the recency-relevant
  // signal in chat. Standard tier reintroduces the 30-day breakdown.
  let block = `### Lifelight summary
- Outdoor sessions: ${sessions.length} · device sessions: ${devSessions.length} · devices in library: ${devices.length}${baselineLine}
- Today's cumulative MED: ${(medToday * 100).toFixed(0)}%${medToday > 1 ? ' (over personal MED — exposure risk)' : ''}
${activeSession ? `- ACTIVE SESSION in progress (started ${formatRelative(activeSession.startedAt)})\n` : ''}${lastSession ? `- Most recent outdoor session: ${formatRelative(lastSession.endedAt)} (${Math.round(lastSession.durationMin || 0)} min)\n` : ''}
### 7-day per-channel dose totals (channel-au, sun + devices combined)
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
  }
  if (screens.length > 0) {
    const evening = screens.filter(sc => sc.eveningUseAfterSunset).length;
    const blueOff = screens.filter(sc => sc.eveningUseAfterSunset && !sc.blueBlocker).length;
    s += `- Screens tracked: ${screens.length}`;
    if (evening > 0) s += `; ${evening} used after sunset`;
    if (blueOff > 0) s += ` (${blueOff} without blue-blocker — direct retinal melatonin suppression)`;
    s += '\n';
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
  }
  // Indoor burden tier + deficit axes — collapsed onto one line. Burden is
  // the qualitative summary, d2/d3 are the components that drove it.
  if (typeof window.computeIndoorBurden === 'function') {
    try {
      const burden = window.computeIndoorBurden();
      if (burden && typeof burden === 'object') {
        const tierLabel = ['negligible', 'mild', 'moderate', 'high', 'severe'][burden.tier] || 'unknown';
        // Inline rubric so the AI knows what tier 3/4 means without
        // having to guess from the qualitative label alone.
        let line = `- Indoor light burden: ${tierLabel} (tier ${burden.tier}/4 · 0=well-aligned, 4=severe across screens/sleep/daylight)`;
        if (typeof window.computeDeficitAxes === 'function') {
          try {
            const axes = window.computeDeficitAxes();
            if (axes && (axes.d2 != null || axes.d3 != null)) {
              line += ` · d2=${(axes.d2 ?? 0).toFixed(2)} (intensity gap) · d3=${(axes.d3 ?? 0).toFixed(2)} (after-sunset blue)`;
            }
          } catch (e) {}
        }
        s += line + '\n';
      }
    } catch (e) {}
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
| Date | Min | Body% | Eyes | UV | MED% | Vit-D | Circ |
|------|-----|-------|------|-----|------|-------|------|
`;
  for (const sess of recent.slice().reverse()) {
    const date = new Date(sess.startedAt).toISOString().slice(0, 10);
    const dur = Math.round(sess.durationMin || 0);
    const bodyPct = sess.bodyExposure ? Math.round((sess.bodyExposure.fraction || 0) * 100) : 0;
    const eyes = sess.eyeExposure?.mode || '?';
    const uv = sess.atmosphere?.uvIndex != null ? sess.atmosphere.uvIndex.toFixed(1) : '?';
    const med = sess.safety?.medFraction != null ? `${(sess.safety.medFraction * 100).toFixed(0)}` : '?';
    const vitD = sess.doses?.vitamin_d != null ? sess.doses.vitamin_d.toFixed(1) : '?';
    const circ = sess.doses?.circadian != null ? sess.doses.circadian.toFixed(1) : '?';
    block += `| ${date} | ${dur} | ${bodyPct}% | ${eyes} | ${uv} | ${med} | ${vitD} | ${circ} |\n`;
  }
  block += '\n';

  // Correlation table — computed on demand by sun-correlations.js
  let corr = state.importedData?.sunCorrelations;
  if ((!corr || !corr.pairs) && typeof window.getSunCorrelations === 'function') {
    try { corr = window.getSunCorrelations(); } catch (e) {}
  }
  if (corr && corr.pairs) {
    block += `### Sun-channel × biomarker correlations (computed from your data)
${formatCorrelations(corr.pairs)}

`;
  }

  return block;
}

// ─── Tool-call APIs (replaces former deep-tier prompt block) ──────────
//
// Per-session detail belongs in a tool response, not a prompt. These
// functions are the single source of truth for chat tool-calls AND
// the MCP/agent path — the agent can pull the same data without us
// inflating every prompt with sessions it might not need.

const _SLICE_DEFAULT_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere'];
const _SLICE_ALL_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere', 'body', 'eyes', 'location', 'notes'];

// Project a sun session to a canonical, cap-bounded shape. `fields`
// gates each section so callers (especially the agent) can ask for
// just the columns they need. `body` and `location` carry potentially
// sensitive detail — body-region picks, sub-11km coords — and stay
// off by default.
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
    out.body = {
      preset: b.preset || null,
      fraction: b.fraction != null ? +b.fraction.toFixed(2) : null,
      regions: Array.isArray(b.regions) ? b.regions.slice() : [],
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
    try { p = (window.getMeteoConfig && window.getMeteoConfig().privacyRounding) || 0.01; } catch (e) {}
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
// Default field set excludes body-regions and location — those carry the
// most personally-identifying detail and should be opted in explicitly.
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

function formatChannelTotals(totals) {
  const lines = [];
  for (const [k, label] of Object.entries(CHANNEL_LABELS)) {
    const v = totals[k] || 0;
    // Integer format above 10; one decimal below — small doses still resolve.
    const fmt = v >= 10 ? Math.round(v).toString() : v.toFixed(1);
    lines.push(`- ${label}: ${fmt}`);
  }
  return lines.join('\n');
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
  Object.assign(window, { buildSunContext, getSunSessionsSlice, getSunSessionDetail });
}
