// @ts-check
// Embedding-model catalog, benchmark corpus, and deterministic test vectors.

// Each model entry names the transformers.js model ID, its output dimension,
// a tier hint for the UI, and an approximate quantized download size.
export const MODELS = {
  'all-minilm': {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'MiniLM (fast, small)',
    dim: 384,
    tier: 1,
    downloadMB: 22,
    language: 'en',
    notes: 'Current default. Universally works, including WASM-only.',
  },
  'bge-small-en': {
    id: 'Xenova/bge-small-en-v1.5',
    label: 'BGE-small (balanced English)',
    dim: 384,
    tier: 2,
    downloadMB: 33,
    language: 'en',
    notes: 'Better English retrieval than MiniLM. Same 384-dim.',
  },
  'multilingual-e5-small': {
    id: 'Xenova/multilingual-e5-small',
    label: 'Multilingual-E5 (100+ languages)',
    dim: 384,
    tier: 2,
    downloadMB: 40,
    language: 'multi',
    notes: 'Covers 100+ languages. Strong default if your corpus isn\'t English-only.',
  },
  'bge-base-en': {
    id: 'Xenova/bge-base-en-v1.5',
    label: 'BGE-base (best English)',
    dim: 768,
    tier: 3,
    downloadMB: 110,
    language: 'en',
    notes: 'Highest quality for English. Needs WebGPU or a fast CPU.',
  },
};

// Existing libraries without a model were indexed with MiniLM. Keeping this
// default avoids silently forcing a full re-embed during registry migration.
export const DEFAULT_MODEL_KEY = 'all-minilm';

// Varied, realistic chunk-sized inputs keep the device benchmark honest.
export const BENCHMARK_TEXTS = [
  'Vitamin D3 supplementation timing matters for circadian alignment — morning dosing coincides with natural UV-B exposure and supports endogenous synthesis pathways. Sublingual or oil-suspended forms outperform dry tablets for absorption. Co-administration with magnesium and vitamin K2 is standard practice for bone calcium targeting.',
  'Mitochondrial biogenesis responds to cold thermogenesis via PGC-1α upregulation. Brown adipose tissue activation increases with repeated 10-15 minute exposures below 15°C. The adaptive response compounds over 4-6 weeks. Population studies show metabolic flexibility improvements independent of caloric restriction.',
  'Serum ferritin above 200 ng/mL in the absence of iron-deficient anemia often reflects inflammatory state rather than iron overload. hs-CRP co-elevation and transferrin saturation below 45% distinguish acute-phase response from hemochromatosis. HFE genotyping is warranted only when TSAT exceeds 45% persistently.',
  'APOE ε4 carriers show differential lipid response to saturated fat intake compared to ε3 homozygotes. Cardiovascular risk stratification should factor in genotype. Mediterranean-pattern diets appear to mitigate the ε4 penalty in most intervention trials but not all, and the heterogeneity likely reflects background polygenic risk.',
  'GABA-A receptor agonism underlies much of the sedative effect of chamomile-derived apigenin and the flavonoids in valerian root. These act at the benzodiazepine site but with substantially lower efficacy — useful clinically for not producing tolerance in short courses. Drug interactions with licensed GABA-ergic agents are clinically relevant.',
];

// Text-hash → unit-normalized vector. This mirrors the shape returned by a
// transformers.js feature-extraction pipeline without loading model weights.
export function createMockEmbedding(text, dim) {
  const out = new Float32Array(dim);
  let hash = 2166136261;
  const source = String(text);
  for (let i = 0; i < source.length; i++) {
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  }
  for (let i = 0; i < dim; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995);
    out[i] = ((hash | 0) / 2147483647);
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) out[i] /= norm;
  return { data: out };
}
