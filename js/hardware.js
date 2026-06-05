// @ts-check
// hardware.js — GPU detection + model advisor for Local AI settings
// Pure functions, no DOM manipulation, no app imports

// GPU database — sorted by match length descending at init for specificity
const GPU_DB = [
  // Apple Silicon — unified memory (values = minimum config per chip)
  { match: 'Apple M1 Ultra',    vram: 64, unified: true },
  { match: 'Apple M1 Max',      vram: 32, unified: true },
  { match: 'Apple M1 Pro',      vram: 16, unified: true },
  { match: 'Apple M1',          vram: 8,  unified: true },
  { match: 'Apple M2 Ultra',    vram: 64, unified: true },
  { match: 'Apple M2 Max',      vram: 32, unified: true },
  { match: 'Apple M2 Pro',      vram: 16, unified: true },
  { match: 'Apple M2',          vram: 8,  unified: true },
  { match: 'Apple M3 Ultra',    vram: 64, unified: true },
  { match: 'Apple M3 Max',      vram: 36, unified: true },
  { match: 'Apple M3 Pro',      vram: 18, unified: true },
  { match: 'Apple M3',          vram: 8,  unified: true },
  { match: 'Apple M4 Ultra',    vram: 64, unified: true },
  { match: 'Apple M4 Max',      vram: 36, unified: true },
  { match: 'Apple M4 Pro',      vram: 24, unified: true },
  { match: 'Apple M4',          vram: 16, unified: true },
  // NVIDIA RTX 50xx
  { match: 'RTX 5090',          vram: 32 },
  { match: 'RTX 5080',          vram: 16 },
  { match: 'RTX 5070 Ti',       vram: 16 },
  { match: 'RTX 5070',          vram: 12 },
  { match: 'RTX 5060 Ti',       vram: 16 },
  { match: 'RTX 5060',          vram: 8  },
  // NVIDIA RTX 40xx
  { match: 'RTX 4090',          vram: 24 },
  { match: 'RTX 4080 SUPER',    vram: 16 },
  { match: 'RTX 4080',          vram: 16 },
  { match: 'RTX 4070 Ti SUPER', vram: 16 },
  { match: 'RTX 4070 Ti',       vram: 12 },
  { match: 'RTX 4070 SUPER',    vram: 12 },
  { match: 'RTX 4070',          vram: 12 },
  { match: 'RTX 4060 Ti',       vram: 8  },
  { match: 'RTX 4060',          vram: 8  },
  // NVIDIA RTX 30xx
  { match: 'RTX 3090 Ti',       vram: 24 },
  { match: 'RTX 3090',          vram: 24 },
  { match: 'RTX 3080 Ti',       vram: 12 },
  { match: 'RTX 3080',          vram: 10 },
  { match: 'RTX 3070 Ti',       vram: 8  },
  { match: 'RTX 3070',          vram: 8  },
  { match: 'RTX 3060 Ti',       vram: 8  },
  { match: 'RTX 3060',          vram: 12 },
  // NVIDIA GTX (older but still common)
  { match: 'GTX 1660 Ti',       vram: 6  },
  { match: 'GTX 1660 SUPER',    vram: 6  },
  { match: 'GTX 1660',          vram: 6  },
  { match: 'GTX 1650',          vram: 4  },
  { match: 'GTX 1080 Ti',       vram: 11 },
  { match: 'GTX 1080',          vram: 8  },
  // NVIDIA RTX laptop
  { match: 'RTX 4090 Laptop',   vram: 16 },
  { match: 'RTX 4080 Laptop',   vram: 12 },
  { match: 'RTX 4070 Laptop',   vram: 8  },
  { match: 'RTX 4060 Laptop',   vram: 8  },
  { match: 'RTX 3080 Laptop',   vram: 8  },
  { match: 'RTX 3070 Laptop',   vram: 8  },
  { match: 'RTX 3060 Laptop',   vram: 6  },
  // AMD RX 7000
  { match: 'RX 7900 XTX',       vram: 24 },
  { match: 'RX 7900 XT',        vram: 20 },
  { match: 'RX 7800 XT',        vram: 16 },
  { match: 'RX 7700 XT',        vram: 12 },
  { match: 'RX 7600',           vram: 8  },
  // AMD RX 6000
  { match: 'RX 6950 XT',        vram: 16 },
  { match: 'RX 6900 XT',        vram: 16 },
  { match: 'RX 6800 XT',        vram: 16 },
  { match: 'RX 6800',           vram: 16 },
  { match: 'RX 6700 XT',        vram: 12 },
  { match: 'RX 6600 XT',        vram: 8  },
  // Intel Arc
  { match: 'Arc A770',          vram: 16 },
  { match: 'Arc A750',          vram: 8  },
  { match: 'Arc A580',          vram: 8  },
  // AMD Vega (older/hybrid)
  { match: 'Vega M GH',         vram: 4  },
  { match: 'Vega M GL',         vram: 4  },
  { match: 'Vega 56',           vram: 8  },
  { match: 'Vega 64',           vram: 8  },
];

// Sort by match length descending — "RTX 4070 Ti SUPER" must match before "RTX 4070"
GPU_DB.sort((a, b) => b.match.length - a.match.length);

const LS_KEY = 'labcharts-hw-vram-override';

export function getHardwareOverride() {
  try {
    const v = parseFloat(localStorage.getItem(LS_KEY));
    return isNaN(v) || v <= 0 ? null : v;
  } catch { return null; }
}

export function saveHardwareOverride(vram) {
  if (vram === null || vram === undefined) {
    localStorage.removeItem(LS_KEY);
  } else {
    localStorage.setItem(LS_KEY, String(vram));
  }
}

function detectGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { name: null, vram: null, unified: false, renderer: null, source: 'unavailable' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { name: null, vram: null, unified: false, renderer: null, source: 'blocked' };
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    const upper = renderer.toUpperCase();
    for (const entry of GPU_DB) {
      if (upper.includes(entry.match.toUpperCase())) {
        return { name: entry.match, vram: entry.vram, unified: !!entry.unified, renderer, source: 'webgl' };
      }
    }
    // No DB match — return raw renderer string
    return { name: renderer, vram: null, unified: false, renderer, source: 'webgl-unmatched' };
  } catch {
    return { name: null, vram: null, unified: false, renderer: null, source: 'error' };
  }
}

export async function detectHardware() {
  const gpu = detectGPU();
  const override = getHardwareOverride();
  if (override !== null) {
    gpu.vram = override;
    gpu.source = 'manual';
  }
  const nav = /** @type {Navigator & { deviceMemory?: number }} */ (navigator);
  return {
    gpu,
    ram: { gb: nav.deviceMemory || null, source: nav.deviceMemory ? 'deviceMemory' : 'unknown' },
    cpuThreads: navigator.hardwareConcurrency || null,
  };
}

export function assessModel(modelObj, hardware) {
  // Cloud models run on Ollama's servers — no local VRAM needed
  if (modelObj.name && modelObj.name.includes(':cloud')) {
    return { tier: 'cloud', badge: '\u2601', vramNeeded: 0, label: 'Cloud' };
  }
  const vramNeeded = (modelObj.size / 1e9) * 1.15; // file size + 15% runtime overhead
  const available = hardware.gpu.vram;
  if (!available || !modelObj.size) {
    return { tier: 'unknown', badge: '?', vramNeeded, label: 'Unknown' };
  }
  // Apple Silicon unified memory — Ollama can use ~75% of total
  const usable = hardware.gpu.unified ? available * 0.75 : available;
  if (vramNeeded <= usable * 0.85) {
    return { tier: 'fits', badge: '\u25CF', vramNeeded, label: 'Fits well' };
  }
  if (vramNeeded <= usable) {
    return { tier: 'tight', badge: '\u25D1', vramNeeded, label: 'Tight fit' };
  }
  return { tier: 'toobig', badge: '\u25CB', vramNeeded, label: 'Too large' };
}

// ═══════════════════════════════════════════════
// MODEL FITNESS for getbased use case
// ═══════════════════════════════════════════════
// Reference: Sonnet 4.6 via API. Local models are rated against that bar.
// getbased needs: strict JSON extraction from messy lab PDFs (dozens of markers,
// units, reference ranges), long system prompts (~2k tokens), medical knowledge,
// and interpretive chat. Most models under 14B will struggle.
//
// Tiers:  recommended — closest to cloud quality, reliable for all lab reports
//         capable     — handles most reports, occasional JSON issues on complex ones
//         underpowered — will frequently miss markers or break JSON structure
//         inadequate   — don't use for lab analysis
// ── UPDATE when new model generations launch (same cadence as OPENROUTER_RECOMMENDED in api.js)
//    Also update MODEL_CATALOG below.
const MODEL_FITNESS = [
  // Qwen 2.5 — best family for structured extraction
  { match: 'qwen2.5:72b',     tier: 'recommended', note: 'Cloud-grade quality' },
  { match: 'qwen2.5:32b',     tier: 'recommended', note: 'Excellent structured extraction' },
  { match: 'qwen2.5:14b',     tier: 'recommended', note: 'Best value — reliable lab parsing at moderate size' },
  { match: 'qwen2.5:7b',      tier: 'capable',     note: 'Handles simple reports, may struggle with complex ones' },
  { match: 'qwen2.5:3b',      tier: 'underpowered', note: 'Frequent JSON errors on multi-page reports' },
  { match: 'qwen2.5:1.5b',    tier: 'inadequate',  note: 'Cannot reliably parse lab reports' },
  { match: 'qwen2.5:0.5b',    tier: 'inadequate',  note: 'Cannot parse lab reports' },
  // Qwen 3.5
  { match: 'qwen3.5:72b',     tier: 'recommended', note: 'Cloud-grade, latest generation' },
  { match: 'qwen3.5:32b',     tier: 'recommended', note: 'Excellent for all lab report types' },
  { match: 'qwen3.5:14b',     tier: 'recommended', note: 'Reliable parsing + strong medical knowledge' },
  { match: 'qwen3.5:9b',      tier: 'capable',     note: 'Good for most reports, may miss edge cases' },
  { match: 'qwen3.5:4b',      tier: 'underpowered', note: 'Misses markers on complex reports' },
  { match: 'qwen3.5:1.5b',    tier: 'inadequate',  note: 'Cannot reliably parse lab reports' },
  // Qwen 3
  { match: 'qwen3:30b',       tier: 'recommended', note: 'Strong reasoning + structured output' },
  { match: 'qwen3:14b',       tier: 'recommended', note: 'Reliable for lab analysis' },
  { match: 'qwen3:8b',        tier: 'capable',     note: 'Decent but verbose, may need retries' },
  { match: 'qwen3:4b',        tier: 'underpowered', note: 'Struggles with strict JSON format' },
  { match: 'qwen3:1.7b',      tier: 'inadequate',  note: 'Cannot parse lab reports' },
  { match: 'qwen3:0.6b',      tier: 'inadequate',  note: 'Cannot parse lab reports' },
  { match: 'qwq:',            tier: 'capable',     note: 'Strong reasoning but very verbose output' },
  // Llama 3.x
  { match: 'llama3.3:70b',    tier: 'recommended', note: 'Top-tier instruction following' },
  { match: 'llama3.1:70b',    tier: 'recommended', note: 'Reliable for complex lab reports' },
  { match: 'llama3.1:8b',     tier: 'capable',     note: 'Handles basic reports, weaker on specialty labs' },
  { match: 'llama3.2:3b',     tier: 'underpowered', note: 'Misses markers, inconsistent JSON' },
  { match: 'llama3.2:1b',     tier: 'inadequate',  note: 'Cannot parse lab reports' },
  // Gemma
  { match: 'gemma3:27b',      tier: 'recommended', note: 'Strong scientific understanding' },
  { match: 'gemma3:12b',      tier: 'recommended', note: 'Good balance of quality and speed' },
  { match: 'gemma3:4b',       tier: 'underpowered', note: 'Limited medical knowledge at this size' },
  { match: 'gemma3:1b',       tier: 'inadequate',  note: 'Cannot parse lab reports' },
  { match: 'gemma2:27b',      tier: 'recommended', note: 'Strong scientific/medical text' },
  { match: 'gemma2:9b',       tier: 'capable',     note: 'Decent structured extraction' },
  { match: 'gemma2:2b',       tier: 'inadequate',  note: 'Cannot parse lab reports' },
  // Mistral
  { match: 'mistral-small:',  tier: 'capable',     note: '22B — decent medical comprehension' },
  { match: 'mistral:7b',      tier: 'underpowered', note: 'Weak at structured JSON output' },
  { match: 'mistral-nemo:',   tier: 'capable',     note: 'Reasonable instruction following' },
  { match: 'mixtral:',        tier: 'capable',     note: 'MoE — fast but inconsistent on complex reports' },
  // DeepSeek
  { match: 'deepseek-r1:70b', tier: 'recommended', note: 'Excellent reasoning for complex cases' },
  { match: 'deepseek-r1:32b', tier: 'recommended', note: 'Strong reasoning at reasonable size' },
  { match: 'deepseek-r1:14b', tier: 'capable',     note: 'Decent but very verbose, slow' },
  { match: 'deepseek-r1:8b',  tier: 'underpowered', note: 'Reasoning too limited for reliable parsing' },
  { match: 'deepseek-r1:1.5b',tier: 'inadequate',  note: 'Cannot parse lab reports' },
  { match: 'deepseek-v2:',    tier: 'capable',     note: 'MoE, decent at structured tasks' },
  { match: 'deepseek-v3:',    tier: 'recommended', note: 'Strong across all tasks' },
  // Phi
  { match: 'phi4:14b',        tier: 'capable',     note: 'Decent at 14B but weaker JSON compliance' },
  { match: 'phi4:',           tier: 'underpowered', note: 'Struggles with strict JSON format' },
  { match: 'phi3:',           tier: 'inadequate',  note: 'Cannot handle getbased prompts reliably' },
  // Command R
  { match: 'command-r-plus:', tier: 'recommended', note: 'Designed for structured extraction' },
  { match: 'command-r:',      tier: 'capable',     note: 'Good at format instructions' },
  // Ollama Cloud models (free tier — no local VRAM needed)
  { match: 'deepseek-v3.2:cloud', tier: 'recommended', note: 'Cloud — clean JSON extraction, strong medical reasoning' },
  { match: 'nemotron-3-super:cloud', tier: 'recommended', note: 'Cloud — 120B MoE, reliable structured output' },
  { match: 'kimi-k2.5:cloud', tier: 'recommended', note: 'Cloud — 256K context, multimodal, thinking model' },
  { match: 'qwen3.5:cloud',   tier: 'recommended', note: 'Cloud — up to 122B, thinking model' },
  { match: 'glm-5:cloud',     tier: 'capable',     note: 'Cloud — 744B MoE, thinking model' },
  { match: 'gemini-3-flash-preview:cloud', tier: 'capable', note: 'Cloud — fast, may truncate on complex reports' },
  { match: 'qwen3-coder-next:cloud', tier: 'capable', note: 'Cloud — code-focused, decent at structured extraction' },
  { match: ':cloud',           tier: 'capable',     note: 'Cloud model — runs on Ollama servers, no GPU required' },
  // Others
  { match: 'solar:',          tier: 'underpowered', note: 'Inconsistent JSON output' },
  { match: 'yi:',             tier: 'underpowered', note: 'Weak at strict structured output' },
  { match: 'codellama:',      tier: 'inadequate',  note: 'Code-specialized, no medical knowledge' },
  { match: 'tinyllama:',      tier: 'inadequate',  note: 'Far too small' },
  { match: 'orca-mini:',      tier: 'inadequate',  note: 'Outdated, unreliable' },
];
// Sort by match length descending for specificity
MODEL_FITNESS.sort((a, b) => b.match.length - a.match.length);

export function assessFitness(modelName) {
  if (!modelName) return null;
  // Normalize: strip org prefix (owner/model), LM Studio "-" → Ollama ":"
  const lower = modelName.toLowerCase().replace(/^[^/]*\//, '').replace(/^(.+?)[-:](\d+\.?\d*b)/, '$1:$2');
  // Exact/specific match first (sorted by length descending)
  for (const entry of MODEL_FITNESS) {
    if (lower.includes(entry.match.replace(/:$/, '')) || lower.startsWith(entry.match)) {
      return { tier: entry.tier, note: entry.note };
    }
  }
  // Extract parameter count from name if present (e.g. "qwen3.5:0.8b", "Jan-v3-4b")
  const paramMatch = lower.match(/[\-:](\d+\.?\d*)b/);
  const params = paramMatch ? parseFloat(paramMatch[1]) : 0;
  // Fallback: if model has :latest or unknown size tag, try matching just the family
  // e.g. "qwen3.5:latest" → look for any qwen3.5 entry
  const family = lower.split(':')[0];
  const familyEntries = MODEL_FITNESS.filter(e => e.match.startsWith(family + ':'));
  if (familyEntries.length > 0 && !params) {
    const bestTier = Math.max(...familyEntries.map(e => TIER_RANK[e.tier] || 0));
    // Cap at "capable" since we don't know the actual size
    const cappedRank = Math.min(bestTier, TIER_RANK.capable);
    const tierName = Object.entries(TIER_RANK).find(([, v]) => v === cappedRank)?.[0] || 'capable';
    return { tier: tierName, note: 'Depends on model size — pull a specific variant (e.g. :14b) for best results' };
  }
  // Rate by parameter count — works for any model family
  if (params) {
    if (params >= 30) return { tier: 'recommended', note: `${params}B parameters — large enough for reliable lab parsing` };
    if (params >= 14) return { tier: 'capable', note: `${params}B parameters — handles most reports` };
    if (params >= 7) return { tier: 'underpowered', note: `${params}B parameters — may struggle with complex reports` };
    return { tier: 'inadequate', note: `${params}B parameters — too small for reliable lab analysis` };
  }
  return null; // unknown model family
}

const TIER_RANK = { recommended: 4, capable: 3, underpowered: 2, inadequate: 1 };

export function getBestModel(modelDetails, hardware) {
  const candidates = modelDetails.map(m => {
    const fitness = assessFitness(m.name);
    const vram = hardware ? assessModel(m, hardware) : null;
    const fitsInVram = !vram || vram.tier === 'fits' || vram.tier === 'tight' || vram.tier === 'unknown';
    return { name: m.name, fitness, fitsInVram, rank: fitness ? TIER_RANK[fitness.tier] || 0 : 0 };
  });
  const fitting = candidates.filter(c => c.fitsInVram).sort((a, b) => b.rank - a.rank);
  return fitting.length > 0 ? fitting[0] : null;
}

// Known model catalog — approximate file sizes (Q4_K_M) for VRAM estimation.
// Used to suggest the best pullable model for a given VRAM budget.
// sizeGb = approximate file size at default quantization. VRAM ≈ sizeGb * 1.15
// quality = getbased-specific quality rank (higher = better for lab analysis).
//   Within the same fitness tier, quality determines which model to suggest.
//   Latest gen + best at structured JSON + medical knowledge = highest quality.
// ── UPDATE when new model generations launch (same cadence as OPENROUTER_RECOMMENDED in api.js)
//    Also update MODEL_FITNESS above.
const MODEL_CATALOG = [
  // Qwen 3.5 — latest gen, best structured extraction
  { model: 'qwen3.5:72b',  sizeGb: 43,  tier: 'recommended', quality: 100 },
  { model: 'qwen3.5:32b',  sizeGb: 20,  tier: 'recommended', quality: 95 },
  { model: 'qwen3.5:14b',  sizeGb: 9,   tier: 'recommended', quality: 90 },
  { model: 'qwen3.5:9b',   sizeGb: 6.6, tier: 'capable',     quality: 70 },
  { model: 'qwen3.5:4b',   sizeGb: 2.8, tier: 'underpowered', quality: 30 },
  // Qwen 2.5 — proven, slightly older
  { model: 'qwen2.5:72b',  sizeGb: 43,  tier: 'recommended', quality: 92 },
  { model: 'qwen2.5:32b',  sizeGb: 20,  tier: 'recommended', quality: 88 },
  { model: 'qwen2.5:14b',  sizeGb: 9,   tier: 'recommended', quality: 85 },
  { model: 'qwen2.5:7b',   sizeGb: 4.7, tier: 'capable',     quality: 60 },
  // Qwen 3
  { model: 'qwen3:30b',    sizeGb: 18,  tier: 'recommended', quality: 86 },
  { model: 'qwen3:14b',    sizeGb: 9,   tier: 'recommended', quality: 82 },
  { model: 'qwen3:8b',     sizeGb: 5,   tier: 'capable',     quality: 58 },
  // Llama
  { model: 'llama3.3:70b', sizeGb: 43,  tier: 'recommended', quality: 88 },
  { model: 'llama3.1:70b', sizeGb: 43,  tier: 'recommended', quality: 84 },
  { model: 'llama3.1:8b',  sizeGb: 4.7, tier: 'capable',     quality: 55 },
  // Gemma
  { model: 'gemma3:27b',   sizeGb: 17,  tier: 'recommended', quality: 83 },
  { model: 'gemma3:12b',   sizeGb: 8,   tier: 'recommended', quality: 78 },
  { model: 'gemma2:27b',   sizeGb: 16,  tier: 'recommended', quality: 76 },
  { model: 'gemma2:9b',    sizeGb: 5.4, tier: 'capable',     quality: 52 },
  // DeepSeek
  { model: 'deepseek-r1:70b', sizeGb: 43, tier: 'recommended', quality: 80 },
  { model: 'deepseek-r1:32b', sizeGb: 20, tier: 'recommended', quality: 75 },
  // Command R
  { model: 'command-r-plus',  sizeGb: 60, tier: 'recommended', quality: 72 },
  // Mistral
  { model: 'mistral-small',   sizeGb: 13, tier: 'capable',     quality: 50 },
];

// Returns a suggestion to pull a better model, or null if the user already has a recommended one
export function getUpgradeSuggestion(modelDetails, hardware) {
  const best = getBestModel(modelDetails, hardware);
  // Already has a recommended model that fits? No upgrade needed
  if (best && best.fitness && best.fitness.tier === 'recommended') return null;
  const vram = hardware?.gpu?.vram;
  if (!vram) return null;
  const isUnified = hardware?.gpu?.unified;
  const usable = isUnified ? vram * 0.75 : vram;
  // Find the best catalog model that fits and is better than what user has
  const bestRank = best ? TIER_RANK[best.fitness?.tier] || 0 : 0;
  const candidates = MODEL_CATALOG
    .filter(c => {
      const vramNeeded = c.sizeGb * 1.15;
      const fits = vramNeeded <= usable;
      const betterTier = TIER_RANK[c.tier] > bestRank;
      return fits && betterTier;
    })
    .sort((a, b) => {
      // Prefer higher tier, then higher quality within same tier
      const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      return tierDiff !== 0 ? tierDiff : b.quality - a.quality;
    });
  if (candidates.length === 0) return null;
  const pick = candidates[0];
  // Don't suggest a model the user already has installed
  const pickFamily = pick.model.split(':')[0];
  const pickSize = pick.model.split(':')[1] || '';
  if (modelDetails.some(m => m.name.startsWith(pickFamily) && m.name.includes(pickSize))) return null;
  // Build a helpful note
  const tierLabel = pick.tier === 'recommended' ? 'Recommended' : 'Capable';
  const note = vramNeededNote(pick, usable, tierLabel);
  return { model: pick.model, note };
}

function vramNeededNote(pick, usableVram, tierLabel) {
  const vramNeeded = (pick.sizeGb * 1.15).toFixed(0);
  const headroom = Math.round(((usableVram - pick.sizeGb * 1.15) / usableVram) * 100);
  if (pick.tier === 'recommended' && headroom > 30) {
    return `${tierLabel} for lab analysis. Uses ~${vramNeeded} GB — runs comfortably on your hardware.`;
  }
  if (pick.tier === 'recommended') {
    return `${tierLabel} for lab analysis. Uses ~${vramNeeded} GB — fits your VRAM with some headroom.`;
  }
  return `${tierLabel} — best option for your VRAM. Consider a cloud provider for complex reports.`;
}

// Kept for backward compat with tests
export function getModelSuggestions(hardware) {
  const vram = hardware?.gpu?.vram;
  if (!vram) return [];
  const suggestion = getUpgradeSuggestion([], hardware);
  return suggestion ? [{ model: suggestion.model, why: suggestion.note }] : [];
}
