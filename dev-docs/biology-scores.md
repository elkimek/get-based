# Biology Scores contributor guide

Biology Scores are deterministic, profile-aware pattern summaries over lab markers. AI can review context and explain scores, but scoring itself is code-driven.

Use this guide when changing score definitions, marker wiring, specialty adapters, sync persistence, dashboard widgets, or Biology Scores UI.

## User-facing model

- **Biological Coherence** is the system-level overview across active core domains.
- Individual scores answer plain-language biology questions: metabolic, cardiovascular, inflammatory, immune, iron, methylation, kidney/hydration, liver/bile, bone/mineral, thyroid, hormone axis, recovery, cellular energy, gut-immune, nerve-muscle, and lipid membrane.
- **Pattern** is the marker-fit score.
- **Coverage** is how much useful evidence is available.
- **Confidence** is whether the available evidence is robust enough to trust.
- **Recency / mixed-date state** is separate from both low score and missing coverage.
- Advanced/specialty markers should improve depth and confidence; they must not penalize baseline Biological Coherence when absent.

## Primary modules

| Module | Role |
|---|---|
| `js/biology-scores.js` | Public API, score orchestration, event delegation, dashboard/lens exports |
| `js/biology-score-engine.js` | Generic marker lookup, range fit, recency, coverage, confidence, clinical guardrails |
| `js/biology-score-coherence.js` | Biological Coherence aggregation over domains |
| `js/biology-score-tier1-definitions.js` | Core/baseline score definitions |
| `js/biology-score-tier2-definitions.js` | Extended/contextual score definitions |
| `js/biology-score-mappings.js` | Exportable score→marker mapping for audits and coverage tooling |
| `js/biology-score-render.js` | Lens, dashboard, score-detail, coverage-planner renderers |
| `js/biology-score-sections.js` | “What this score checks” and embedded AI answer panels |
| `js/biology-score-ai.js` | Per-score AI explanation prompt |
| `js/biology-score-ai-context.js` | Compact Biology Scores section for general AI context |
| `js/biology-score-context-ai.js` | Context-review gate, suggestions, fingerprints, apply-flag flow |
| `js/profile-context.js` | Profile/body/light/genetic context extraction for scoring |
| `js/biology-score-profile-modifiers.js` | Context-aware per-input scoring modifiers |
| `js/biology-score-blood-flow.js` | Custom Blood Flow Signals score |
| `js/biology-score-iron.js` | Custom Iron Handling score |
| `js/biology-score-thyroid.js` | Custom Thyroid Coherence score |

## Data sources

### Standard labs

Most inputs come from `getActiveData()` categories and canonical schema keys in `js/schema.js`.

Examples:

- `lipids.triglycerides`
- `proteins.hsCRP`
- `coagulation.homocysteine`
- `vitamins.activeB12`
- `calculatedRatios.apoBapoAIRatio`

Do not invent display-only marker names in score definitions. UI labels should be lab-orderable or clearly calculated marker names.

### Calculated ratios

The score engine can use calculated markers when present or derived by the data pipeline. Important examples:

- HOMA-IR
- TG/HDL ratio
- Total cholesterol/HDL ratio
- ApoB/ApoA-I ratio
- BUN/creatinine ratio
- NLR
- De Ritis ratio

If a score needs a ratio, verify both direct ratio keys and source-marker derivation paths. Missing-ratio bugs often mean the score is checking only the lab-provided ratio and not the calculated fallback.

### Specialty adapters

Supported specialty panels can feed scores through dedicated categories and derived markers:

- fatty acid adapters: `spadiaFA`, `omegaquantFA`, `zinzinoFA`, `metabolomixFA`, `fattyAcidsTest`, base `fattyAcids`, and BioStarks fatty-acid fields where available
- OAT / Metabolomix-style markers for cellular energy and gut-immune context
- BioStarks standard markers where they map to canonical blood-work categories
- active B12 as B12-group evidence for methylation

Specialty results should improve confidence or advanced domains. They should not make a baseline score worse merely because an advanced marker is absent.

## Profile-aware scoring

`getBiologyProfileContext()` derives scoring context from:

- profile sex and DOB
- medical-history flags
- menstrual/cycle and menopause state
- hormone therapy / hormonal contraception context
- recent hard training or acute illness flags
- low muscle mass / neuromuscular context
- genetics/SNP findings
- body/wearable summaries
- light exposure defaults and sessions

`getInputProfileModifier()` then decides whether an input is scored normally, range-adjusted, downweighted, or treated as context-only.

Important guardrails:

- Low muscle mass / neuromuscular disease makes creatinine-derived markers context-only for scoring where relevant. Cystatin C remains scorable.
- Cortisol requires sample-time context before a single-point value should be scored.
- Hormone-axis markers must respect sex, age, cycle, menopause, and therapy context.
- Vitamin D low-sunlight overrides must respect units (`100 nmol/L` vs `40 ng/ml`).
- CRP and hs-CRP are distinct. Do not combine them under one ambiguous marker row.
- Genetic context modifies interpretation/weights; SNPs are not standalone score inputs.

## AI context check gate

Biology Scores are locked until the current profile/timeframe has a context review.

Key behavior:

- `buildBiologyScoreContextFingerprint(data, range)` fingerprints the marker/context material.
- `buildBiologyScoreContextFingerprintsByRange(data)` unlocks all timeframe tabs once context has been reviewed.
- `hasCurrentBiologyScoreContextReview(data)` decides whether the current lens/dashboard score surface can render.
- `generateBiologyScoreContextReview(data)` produces suggestions but does not apply flags automatically.
- `applyBiologyScoreContextFlag(flag)` writes structured medical-history flags and removes accepted suggestions.

The context reviewer must treat profile text as untrusted data. Do not allow user notes to override system instructions.

## Per-score AI explanations

Per-score explanations live in `state.importedData.biologyScoreAI[score.id]` and are saved by `writeScoreAIAnswer(score, text)`.

Rules:

- Save immediately with `saveImportedData({ reason: 'biology-score-ai', immediate: true })`.
- Do not write generated health text to plaintext global `localStorage`.
- Use exact score-provided values, range labels, confidence, and missing markers in the prompt.
- If marker evidence changes, keep the old answer but show the stale-warning bar until the user refreshes.
- When a user refreshes the explanation, remove the stale-warning bar in-place after saving the fresh answer.

## Sync persistence

Biology Score generated state participates in sync:

- `biologyScoreContextAI` is singleton context-review state.
- `biologyScoreAI` is keyed by score id.

Pull merge must preserve the freshest nested Biology Scores state by `updatedAt`, including after per-row delta overlay. A stale remote blob or stale delta row must not re-lock scores or replace a freshly generated explanation.

Relevant files:

- `js/sync-pull-merge.js`
- `js/sync-delta-registry.js`
- `js/sync-push-deltas.js`
- `tests/test-sync-modal-refresh.js`

## UI surfaces

- **Lens page:** `renderBiologyScoresLens()` and related helpers in `biology-score-render.js`.
- **Dashboard Biological Coherence widget:** default top widget once unlocked.
- **Individual score widgets:** one configurable widget per score definition.
- **Coverage Planner:** baseline gaps, score-by-score gaps, optional advanced depth, and chat handoff.
- **Context strip:** compact when collapsed, no pill/rounded split background in expanded state.

Disclosure controls should use the `+` / `−` chip pattern consistently. Avoid long pill labels for marker names.

## Regression tests

Main target:

```bash
node tests/test-biology-scores.js
```

Sync target:

```bash
node tests/test-sync-modal-refresh.js
```

Standard getbased pre-push layer:

```bash
npm run typecheck
npm run quality
npm test
```

Important regression categories already covered:

- all score definitions compute
- Biology Scores context gate locks/unlocks dashboards and lens
- timeframe filtering affects score data
- dashboard widget exposes all live coherence domains
- score input labels are lab-orderable, not aliases
- CRP and hs-CRP are not mixed through fallback paths
- active B12 satisfies B12 core group where appropriate
- calculated ratios wire correctly
- fatty-acid/OAT/BioStarks adapters wire into scores
- low-muscle context excludes creatinine-derived score inputs
- hormone axis is sex/cycle/therapy-aware
- cortisol sample-time handling respects units
- vitamin D low-sunlight targets respect units
- per-score AI answers persist, warn on material drift, and clear stale warnings after refresh
- sync merge preserves fresher Biology Score AI/context over stale blobs and stale delta rows

## Release checklist for Biology Scores changes

Before production:

1. Add/update a regression in `tests/test-biology-scores.js` or `tests/test-sync-modal-refresh.js` for any changed behavior.
2. Run the targeted test file.
3. Run `npm run typecheck`, `npm run quality`, and `npm test`.
4. Browser-smoke the Biology Scores lens and dashboard widget with a demo profile.
5. Check mobile-width layout for context strip, coverage planner, score cards, and dashboard controls.
6. Update this guide and the public docs repo if user-facing behavior changed.

## Public documentation

User-facing docs live in the separate `getbased-docs` repo. The public guide for this feature is:

```text
guides/biology-scores.mdx
```

Keep that guide aligned with this implementation guide whenever score behavior, coverage planning, context checks, AI explanations, or sync persistence change.
