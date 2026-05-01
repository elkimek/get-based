// sun-context.js — buildSunContext({ tier }) for AI integration.
// Tiered serialization to keep cost bounded under prompt-cache discipline.
//
//   tier: 'always'   ~520 tok — Lifelight Profile + 7d rolling + active deficits
//                              (every chat)
//   tier: 'standard' +1200 tok — + 30-day session history + correlation summary
//                              (when user mentions sun / light / sleep / season)
//   tier: 'deep'     +2500 tok — + per-session detail + per-channel deep-dive
//                              (explicit request only)
//
// Spectral reconstruction is NEVER included by default — it's exposed as a
// tool call so the AI can fetch it on demand.

import { state } from './state.js';

// ─── Public API ────────────────────────────────────────────────────────

export function buildSunContext({ tier = 'always' } = {}) {
  const sessions = state.importedData?.sunSessions || [];
  if (sessions.length === 0) return '';

  let ctx = '[section:sunSessions]\n## Light & Sun lens\n\n';
  ctx += alwaysTierBlock(sessions);

  if (tier === 'standard' || tier === 'deep') {
    ctx += standardTierBlock(sessions);
  }
  if (tier === 'deep') {
    ctx += deepTierBlock(sessions);
  }

  ctx += '[/section:sunSessions]\n\n';
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

  let block = `### Lifelight summary
- Total outdoor sessions logged: ${sessions.length}
- Total device sessions logged: ${devSessions.length}
- Light devices in library: ${devices.length}${devices.length ? ` (${devices.map(d => d.brand + ' ' + d.model).join(', ')})` : ''}${baselineLine}
- Today's cumulative MED fraction: ${(medToday * 100).toFixed(0)}%${medToday > 1 ? ' (over personal MED — exposure risk)' : ''}
${activeSession ? `- ACTIVE SESSION in progress (started ${formatRelative(activeSession.startedAt)})` : ''}
${lastSession ? `- Most recent outdoor session: ${formatRelative(lastSession.endedAt)} (${Math.round(lastSession.durationMin || 0)} min)` : ''}

### 7-day per-channel dose totals (channel-au, sun + devices combined)
${formatChannelTotals(totals7d)}

### 30-day per-channel dose totals
${formatChannelTotals(totals30d)}

`;

  // Deficit detection — flag channels at <10% of literature reference (rough heuristic)
  const deficits = detectDeficits(totals30d);
  if (deficits.length > 0) {
    block += `### Active light deficits
${deficits.map(d => `- ${d.label}: ${d.note}`).join('\n')}

`;
  }

  return block;
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

// ─── Tier: deep (+2500 tok) ────────────────────────────────────────────

function deepTierBlock(sessions) {
  const recent = sessions.filter(s => s.endedAt).slice(-10);
  if (recent.length === 0) return '';

  let block = `### Detailed session records (last 10)
`;
  for (const sess of recent.slice().reverse()) {
    block += formatSessionDetail(sess);
  }
  return block;
}

function formatSessionDetail(sess) {
  const start = new Date(sess.startedAt).toISOString();
  const end = sess.endedAt ? new Date(sess.endedAt).toISOString() : '(in progress)';
  let s = `\n#### Session ${sess.id}\n`;
  s += `- Window: ${start} → ${end} (${Math.round(sess.durationMin || 0)} min)\n`;
  if (sess.location) {
    // Honor the user's network privacyRounding setting when building the
    // AI context. Hardcoding `toFixed(2)` (~1.1 km) leaks ~10× sharper
    // coords than the network calls do for users on the default 0.1°
    // (~11 km) rounding. Falls back to 0.01° when no config available.
    let p = 0.01;
    try { p = (window.getMeteoConfig && window.getMeteoConfig().privacyRounding) || 0.01; } catch (e) {}
    const f = 1 / p;
    const round = (n) => (Math.round(n * f) / f).toFixed(p < 0.1 ? 2 : 1);
    s += `- Location: ${round(sess.location.lat)}, ${round(sess.location.lon)} @ ${sess.location.altitudeM || 0}m\n`;
  }
  if (sess.atmosphere) {
    s += `- Atmosphere: UV=${sess.atmosphere.uvIndex?.toFixed(1)} | ozone=${sess.atmosphere.ozoneDU || '?'}DU | cloud=${sess.atmosphere.cloudCover || '?'}% | T=${sess.atmosphere.temperatureC?.toFixed(0)}°C | source=${sess.atmosphere.source} (confidence ${sess.atmosphere.confidence?.toFixed(2)})\n`;
  }
  if (sess.bodyExposure) {
    s += `- Body: ${sess.bodyExposure.preset || '?'} (${(sess.bodyExposure.fraction * 100).toFixed(0)}%)`;
    if (sess.bodyExposure.regions?.length) s += ` regions=[${sess.bodyExposure.regions.join(',')}]`;
    if (sess.bodyExposure.sunscreenSPF) s += ` SPF=${sess.bodyExposure.sunscreenSPF}`;
    if (sess.bodyExposure.glassBetween) s += ` glass-between`;
    s += '\n';
  }
  if (sess.eyeExposure) {
    s += `- Eyes: ${sess.eyeExposure.mode}/${sess.eyeExposure.lensTint || 'clear'} (${sess.eyeExposure.durationSec || 0}s)\n`;
  }
  if (sess.doses) {
    s += `- Channels: ${Object.entries(sess.doses).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(', ')}\n`;
  }
  if (sess.safety) {
    s += `- Safety: SED=${sess.safety.sed?.toFixed(2)} | MED=${(sess.safety.medFraction * 100).toFixed(0)}% (Fitz ${sess.safety.fitzpatrick}) | retinal-UV=${sess.safety.retinalUV?.toFixed(1)} J/m²\n`;
  }
  if (sess.notes) s += `- Notes: ${sess.notes}\n`;
  return s;
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
    lines.push(`- ${label}: ${v.toFixed(1)}`);
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
  Object.assign(window, { buildSunContext });
}
