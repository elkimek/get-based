# Biology Scores Scientific Review

Working note for the `biology-scores` lens. These scores are deterministic educational pattern reads, not diagnoses. The formulas should be revised around evidence strength before production release.

## Evidence tiers

### Strong / production direction

#### Metabolic insulin-resistance signal
Use fasting glucose, fasting insulin, HOMA-IR, triglycerides, HDL, and TG/HDL as a practical insulin-resistance/metabolic-strain read.

- HOMA-IR is a validated fasting surrogate for insulin resistance from glucose + insulin. Original model: Matthews et al., Diabetologia 1985, PMID: 3899825.
- TG/HDL is a useful low-cost surrogate for metabolic syndrome/insulin resistance, but thresholds vary by sex, ethnicity, BMI, and unit system.
- Product wording should avoid claiming literal “metabolic flexibility” unless we later include dynamic testing, CGM response, exercise response, or fasting/refeed data.

Formula direction:
- Keep this score, but consider renaming to **Metabolic Strain** or **Insulin Resistance Signal**.
- Prioritize HOMA-IR/insulin/TG-HDL over broad fatty-acid extras.
- Always normalize units before ratio scoring.

#### Iron handling interpretation
Ferritin + transferrin saturation + CBC is clinically meaningful, but this should be more rule-based than a single linear composite.

- Ferritin and TSAT are standard for iron deficiency/overload workups.
- Ferritin is an acute-phase reactant; interpret with hsCRP/GGT/liver context.
- TSAT ≥45% plus high ferritin is often a hemochromatosis workup trigger.
- Copper/ceruloplasmin interpretation is context-heavy and should remain secondary.

Formula direction:
- Keep as a production-direction module, but split into branches: low iron availability, inflammation/functional deficiency, overload signal, copper support flags.
- Do not treat all markers as “higher/lower is better” on one axis.

## Moderate / contextual

#### Lipid membrane / fatty acids
Omega-3 index is the strongest anchor. AA/EPA and omega-6/3 are useful context but weaker as clinical outcome predictors.

- Omega-3 Index = RBC EPA + DHA % is the best-supported biomarker. Harris & von Schacky 2004 proposed it as a CHD/sudden cardiac death risk marker. DOI: 10.1016/j.ypmed.2004.02.030.
- Avoid treating total omega-6 as inherently bad; omega-6 biology is heterogeneous.
- Do not mix plasma fatty acids, dried-blood-spot fatty acids, and RBC fatty acids as equivalent without provider-specific interpretation.

Formula direction:
- Anchor score on Omega-3 Index if available.
- Treat AA/EPA and omega-6/3 as supporting flags, not dominant weights.

#### Redox / inflammation burden
hsCRP and GGT are useful risk/context markers. Ferritin, uric acid, homocysteine, and vitamin D are context-dependent.

- hsCRP has strong evidence as a cardiovascular inflammatory risk enhancer; ACC/AHA uses hsCRP ≥2 mg/L as a risk-enhancing factor. 2019 ACC/AHA guideline PMID: 30879355.
- GGT is associated with CVD/all-cause mortality and may reflect liver fat, alcohol, oxidative stress, medication, or cholestasis. Du et al. 2013 meta-analysis PMID: 23571185.
- Ferritin is both iron storage and inflammation/liver signal.
- Homocysteine is observationally associated with risk, but B-vitamin lowering trials have not consistently reduced major vascular events.
- Vitamin D should be treated as sufficiency/status, not a linear anti-inflammatory intervention score.

Formula direction:
- Rename away from direct “redox” unless we add direct oxidative stress markers.
- Better product name: **Inflammation & Metabolic Burden**.
- Avoid implying causality from observational markers.

## Experimental / needs formula revision

#### Thyroid coherence
TSH + FT4 + FT3 patterns are useful, but a scalar “coherence” score is not validated.

- Conventional thyroid interpretation relies heavily on TSH and FT4, with FT3 in selected contexts.
- FT3/FT4 can be a rough conversion proxy, but it is not a standalone diagnostic test.
- Illness, caloric restriction, medications, pregnancy, assay interference, and thyroid replacement can distort interpretation.

Formula direction:
- Keep as an interpretive/experimental panel.
- Avoid diagnosing “poor conversion” from FT3/FT4 alone.
- Add context flags before strong scoring language.

#### Thyroid–Mito Signal / MitoThyroid
This is an interesting thyroid × triglyceride/fuel-handling heuristic, but not a validated clinical mitochondrial score. It should answer a different product question than Thyroid Coherence:

- **Thyroid Coherence:** is the thyroid axis internally consistent — TSH, FT4, FT3, conversion, reverse T3 brake context, and antibodies?
- **Thyroid–Mito Signal:** does the thyroid signal appear metabolically expressed — FT3/TSH pattern plus triglyceride/fuel-handling context?

Formula direction:
- Keep as experimental/contextual until we backtest it ourselves.
- Use the user-facing name **Thyroid–Mito Signal** rather than implying direct mitochondrial measurement.
- Add confidence states later: core thyroid/fuel signal, full thyroid panel, full thyroid + metabolic context.
- Validate against longitudinal profiles, symptoms/proxy signals, resting HR/body temperature where available, glucose-insulin/TG-HDL context, inflammation/illness flags, and sensitivity to normal lab noise.

#### Blood flow viscosity
Weakest as a composite. Hematocrit and fibrinogen influence viscosity; D-dimer is acute/contextual; sodium/albumin are not reliable general viscosity proxies.

- Fibrinogen is associated with CVD risk; Fibrinogen Studies Collaboration, JAMA 2005, PMID: 16234522.
- D-dimer is useful for VTE rule-out/acute contexts, not general wellness screening.
- Recent Mendelian-randomization evidence weakens broad causal claims for calculated whole-blood viscosity and CVD outcomes.

Formula direction:
- Do not ship as “Blood Flow Viscosity” without a validated formula or direct viscosity measurement.
- Better: **Hemoconcentration & Coagulation Flags**.
- Keep rule-based and caution-heavy.

## Global formula rules

Avoid:
- Universal cutoffs for sex/ethnicity/age-sensitive markers.
- Symmetric low/high penalties unless clinically justified.
- Mixing specimen types or provider methods without labels.
- Opaque linear composites for bidirectional systems like iron, thyroid, coagulation.
- Diagnostic or causal language.

Prefer:
- Subscores + flags + explanation.
- Evidence tiers visible in UI.
- Coverage/confidence gates.
- Marker-level contributors and missing inputs.
- Separate validated formulas from heuristic/experimental interpretation.

## Implementation revision pass — 2026-06-14

Applied in `js/biology-scores.js`:

- Kept the user-facing **Metabolic Flexibility** name, but constrained the summary to say it is a practical fasting-lab proxy anchored on glucose-insulin pressure and TG/HDL handling.
- Renamed **Redox Stress** to **Inflammation and Metabolic Burden** and reweighted it toward hs-CRP plus GGT as stronger context markers.
- Reweighted **Lipid Membrane** around Omega-3 Index, DHA, and EPA; omega-6/3 and AA/EPA are now supporting context instead of dominant anchors.
- Expanded **Lipid Membrane** mappings across fatty-acid adapter prefixes: `spadiaFA`, `omegaquantFA`, `zinzinoFA`, `metabolomixFA`, `fattyAcidsTest`, base `fattyAcids`, and BioStarks where available.
- Replaced linear **Iron Handling** composite with a rule-aware score for ferritin, transferrin saturation, CBC utilization, copper support, inflammation and overload flags.
- Replaced **Blood Flow Viscosity** with **Blood Flow Signals**, keeping it experimental and adding fibrinogen/D-dimer as explicit missing/context markers without forcing the complicated name into the UI.
- Changed the low tone label from **Needs work** to **Low score** and clarified in UI copy: tone = marker pattern, coverage = missing/incomplete inputs, staleness = separate.
- Added interpretation flags to the lens UI for bidirectional/context-heavy scores.
- Added date-coherence gates: score inputs older than 180 days or drawn more than 90 days apart are not scored; the UI asks for a same-panel retest instead.

## Moving experimental scores toward production

A score can move from **Experimental** to **Evidence-backed** only after these are true:

1. **Stable construct:** the name describes what the markers can actually measure, not a broader biological claim.
2. **Same-draw requirement:** all required inputs are collected together, or the score refuses to compute with stale/mixed dates.
3. **Cohort/backtest review:** formulas are checked against real longitudinal profiles and known clinical anchors.
4. **Sensitivity analysis:** changing one marker slightly should not cause misleading score jumps unless the biology justifies it.
5. **Transparent failure states:** missing, stale, and mixed-date inputs must be shown separately from low/strained marker patterns.
6. **Clinical guardrails:** acute/context-heavy markers such as D-dimer, fibrinogen, CRP, ferritin, and thyroid hormones need explicit interpretation warnings.
7. **Documentation:** each production score needs its marker list, weights/rules, evidence tier rationale, and known limitations.

For current scores, **Metabolic Flexibility** and **Iron Handling** are closest because the constructs map to established lab patterns. **MitoThyroid**, **Thyroid Coherence**, and **Blood Flow Signals** need more validation and better marker panels before they should be called production.

## Production-readiness pass — 2026-06-14 follow-up

### Thyroid / mitochondrial scores

The quantum-biology-friendly framing is biologically real, but the current scalar score must stay conservative. The strongest defensible claim is not “we measured mitochondria”; it is: **thyroid signal quality is one upstream driver of mitochondrial biogenesis, respiratory-chain capacity, proton leak/thermogenesis, and substrate handling**.

Evidence anchors:

- T3 regulates mitochondrial biogenesis through thyroid hormone receptors, nuclear/mitochondrial gene expression, NRF-1, and PGC-1α. Review: Weitzel, Iwen & Seitz, *Experimental Physiology* 2003, PMID: 12552316, DOI: 10.1113/eph8802506.
- Thyroid hormones affect mitochondrial respiratory-chain organization, OXPHOS efficiency, proton leak, cristae morphology, supercomplexes, and mitophagy; newer work also separates T3 from T2/T1AM effects. Review: *Bioenergetic Aspects of Mitochondrial Actions of Thyroid Hormones*, *Cells* 2022, DOI: 10.3390/cells11060997.
- Conventional thyroid-lab interpretation still depends mainly on TSH + FT4, with FT3, antibodies, illness state, medication, pregnancy, caloric restriction, and assay effects as context. Therefore the score can be a **pattern summary**, not a diagnosis or validated mitochondrial-function index.

Current product decision:

- Keep **MitoThyroid** as experimental/contextual until it is backtested. It is interesting because FT3 and triglyceride handling plausibly sit at the thyroid ↔ mitochondrial fat-oxidation boundary, but no published clinical score validates this exact construct.
- Move **Thyroid Coherence** toward production by requiring a fuller panel for high confidence: TSH, FT3, FT4, reverse T3, TPO antibodies, thyroglobulin antibodies. The formula now exposes rT3/antibody context as missing mapped inputs rather than pretending TSH/FT3/FT4 alone are enough.
- Upgrade path: add same-draw panel template, collect real longitudinal profiles, compare score changes to symptoms/temperature/resting HR/lipids/glucose/medication state, then run sensitivity tests.

### Iron Handling

Iron Handling remains production-direction, but the guardrail is ferritin. Ferritin is clinically useful and clinically treacherous: it rises during acute phase response and can mask deficiency or mimic overload.

Evidence anchors:

- WHO/CDC iron-status guidance: ferritin is a positive acute-phase protein; CRP/AGP and soluble transferrin receptor improve interpretation during inflammation. WHO technical consultation annex, “The interpretation of indicators of iron status during an acute phase response”.
- TSAT + ferritin + CBC are the core practical axis. Soluble transferrin receptor helps distinguish tissue iron demand/deficiency from inflammatory iron sequestration when available.

Current product decision:

- Add **Inflammation context for ferritin** to the Iron Handling score inputs using hs-CRP/CRP.
- Add **Soluble transferrin receptor** as a missing mapped input so the app nudges toward a better panel when ferritin/TSAT are ambiguous.
- Keep copper/ceruloplasmin secondary: useful for iron mobilization context, not a primary iron diagnosis.

### UI/readability

Biology Scores should not use pill/capsule components for long marker names or content-like labels. Pills are acceptable for tiny controls elsewhere, but in this lens they created truncation and made “Pattern / Coverage / Recency” feel like badge spam.

Current UI direction:

- Score metadata is now rendered as compact labeled status fields (`Pattern`, `Coverage`, `Recency`) with a subtle left accent, not pills.
- Each full score section states the plain-English **question this score answers**, then separates the minimum useful panel from the extended confidence panel.
- Seen/missing inputs are rendered as wrapping inline text tokens; long labels like “Fibrinogen / plasma viscosity context” no longer truncate.
- Marker clickthrough remains available as underlined text, not capsule buttons.
- Embedded AI answer panels live inside each score section. The AI answer explains the deterministic score/question; it does not calculate or override the score.
- Generated Biology Score AI answers persist in profile data (`importedData.biologyScoreAI`) and hydrate after route changes/refreshes; localStorage is only fallback.

### AI trigger policy

Do not use one global rule for every AI surface.

- **Manual/on-demand** fits expensive, multi-card, user-curiosity surfaces such as Biology Scores: seven score answers could burn tokens fast and users may not care about every score every visit.
- **Auto-trigger** fits one-shot, time-bounded, high-value summaries such as the daily Light verdict: one generated answer for today, fingerprint-aware, cached in profile data, and refreshed only when stale or manually retried.
- **Always persist/cache** both paths. If an AI answer is shown in the UI, it should survive navigation/refresh and sync/export where that feature’s data already syncs.

## Tier 1 expansion — 2026-06-14

Added four contextual weighted-composite Biology Scores in `js/biology-score-tier1-definitions.js` rather than bloating the main score engine:

- **Methylation** — internal id `oneCarbonCoherence`; homocysteine, B12, folate, methylmalonic acid, and red-cell context. Question: is methylation demand/B-vitamin handling coherent? The score can show from the core minimum panel (homocysteine + B12 + folate); old/specialty context such as OAT/metabolomics MMA must not throttle score visibility.
- **Fluid & Filtration Coherence** — creatinine/eGFR/cystatin, urea/BUN, sodium/potassium/chloride, BUN/creatinine, albumin. Question: are kidney, hydration, and electrolyte signals stable enough to trust the rest of the panel?
- **Liver–Bile Signal** — ALT, AST, GGT, ALP, bilirubin, albumin, platelets, AST/ALT, ferritin, triglycerides. Question: is liver enzyme/bile-flow/detox-burden pattern calm or strained?
- **Bone–Mineral Signal** — 25-OH vitamin D, calcium, phosphorus, ALP, magnesium/RBC magnesium, calcitriol, creatinine/eGFR. Question: are D-calcium-phosphate-kidney-bone signals coherent?

These are **contextual**, not production/diagnostic. They reuse the generic weighted range-fit engine for the first pass. Upgrade path: backtest on real profiles, add rule-aware branches where bidirectional interpretation matters, and add direct specialty markers such as PTH/ionized calcium/SAM-SAH/holotranscobalamin when they exist in schema/catalogues.

## Tier 2 expansion — 2026-06-14

Added two contextual weighted-composite Biology Scores in `js/biology-score-tier2-definitions.js`:

- **Immune Cell Balance** — WBC, absolute neutrophils/lymphocytes/monocytes/eosinophils/basophils, NLR, platelets, hs-CRP/CRP, vitamin D. Question: does the white-cell pattern look calm, activated, suppressed, allergic, or stress-skewed?
- **Anabolic Recovery Signal** — testosterone/free testosterone, SHBG, FAI, DHEA-S, IGF-1, estradiol, LH/FSH, albumin, total protein, hemoglobin, hs-CRP/CRP, vitamin D, FT3/TSH, CK, urea/creatinine. Question: is the body showing enough anabolic, protein, and recovery signal — or a catabolic/stressed pattern?

These are also **contextual** first-pass scores. Immune Cell Balance is closest to deterministic because CBC differential is common and bounded. Anabolic Recovery Signal is more sex/profile/context-sensitive and should stay conservative until rule-aware branches handle male/female profiles, menstrual/menopause context, TRT/medication state, training load, and inflammation/illness flags.

## Profile-context sensitivity audit — 2026-06-14

Biology Scores must not treat every profile as the same physiology. Current active-data construction applies female-specific marker reference/optimal ranges where schema provides them, and female cycle phase ranges for phase-dependent hormones, but the score layer itself originally had no explicit profile-context modifier. Age is present in AI/report context and biological-age formulas but is not yet a generic score modifier.

Immediate fixes shipped:

- `js/profile-context.js` derives a lightweight scoring context from profile sex/DOB plus medical-history/context notes.
- `js/biology-score-profile-modifiers.js` uses that context to treat creatinine-derived filtration markers as **context only** when the profile suggests low muscle mass / neuromuscular disease / wheelchair / CMT / sarcopenia. Affected deterministic markers: `biochemistry.creatinine`, `biochemistry.egfr`, `biochemistry.eGFR`, and `calculatedRatios.bunCreatRatio`. They remain visible in the used-input table, but show `context`, contribute 0 scoring weight, skip recency blocking, and add interpretation flags. Cystatin C and cystatin-C GFR remain scored because they are muscle-mass-independent filtration markers.
- The same context now suppresses creatinine-contaminated derived biological-age outputs (`PhenoAge`, `Bortz Age`, combined `Biological Age`) rather than showing fake precision when creatinine is unreliable.
- **Anabolic Recovery Signal** now has sex-aware input weighting: female profiles downweight total testosterone/free testosterone/FAI and upweight estradiol context. Sex-specific marker ranges still come from the active data layer; this change fixes the composite-weighting layer so female recovery scoring is not dominated by male-weighted androgen markers.
- Anabolic Recovery now adds deterministic interpretation flags for postmenopause/non-cycling female state, hormone therapy/contraception, recent hard training, acute illness/injury, and older-age context. These flags do not invent alternate formulas; they prevent the score from pretending the same marker pattern has the same meaning in different physiological states.
- Medical History now exposes explicit structured interpretation flags (`lowMuscleMass`, `hormoneTherapy`, `postmenopause`, `intenseTrainingRecent`, `acuteIllnessNearDraw`). Text inference remains as fallback, but users can set the score-relevant states directly.
- Biology Scores now surfaces active context modifiers at the top of the lens/page, and context-only rows show `context` + `excluded from score` so users can see when a marker is visible for interpretation but removed from the score divisor.
- The Biological Age dashboard renderer no longer falls back to showing chronological age as the main value when biological age is unavailable; under low-muscle context it explains that creatinine-based biological age is disabled.
- Biology Scores now includes an AI context-awareness reviewer. AI scans profile context/labs and proposes structured flags with confidence/evidence/affected markers; users manually apply suggestions, and the deterministic scoring engine remains the source of truth.

Remaining review items:

- Add validated age-aware formula branches for DHEA-S, IGF-1, sex hormones, hemoglobin/hematocrit, creatine kinase, and kidney markers where the same value means different biology at 20 vs 70.
