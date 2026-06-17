# Biology Scores — minimum vs extended panel feasibility review

Date: 2026-06-14

Purpose: concrete product/scoring review before adding a top-level **Biological Coherence / System Coherence** score.

This is **not** provider coverage proof. Marker availability and exact pricing must still be verified through the lab-ordering catalogue layer (CZ NČLP → provider offers → coverage/price matrix). This review is the scoring/product layer: what should be minimum, what should be extended, and what should not annoy users by blocking normal scores.

## Product stance

Use **two tiers only**:

1. **Minimum panel** — not the cheapest possible panel; the best-value self-payer panel that produces meaningful, logical scores across multiple systems.
2. **Extended panel** — higher-cost/high-value markers for users who want deeper scoring, better confidence, leaderboard depth, and more complete interpretation.

Assumptions:

- Primary dogfood market lens: Czechia / EU self-pay users.
- Users are willing to pay for labs, but the app should not recommend low-value or exotic markers just to inflate the order.
- Missing extended markers should improve confidence/detail when present, not block minimum scoring.
- The future lab-ordering flow should be able to say: “order these markers to complete/improve your scores.”

## Recommended minimum Biology Panel

This panel should unlock most core scoring and serve as the default lab-order package.

### Hematology / immune

- CBC: WBC, RBC, hemoglobin, hematocrit, MCV, MCH, RDW, platelets
- Differential: neutrophils, lymphocytes, monocytes, eosinophils, basophils

### Metabolic / lipids

- Fasting glucose
- HbA1c
- Total cholesterol
- LDL-C
- HDL-C
- Triglycerides
- Fasting insulin — **minimum** for CZ/EU target; Michal considers it common, cheap, and important enough to include

### Liver / kidney / electrolytes / proteins

- ALT
- AST
- GGT
- ALP
- Total bilirubin
- Creatinine + eGFR
- Urea/BUN
- Sodium
- Potassium
- Chloride
- Calcium
- Phosphorus
- Albumin
- Total protein

### Inflammation / iron / nutrients

- CRP or hs-CRP — hs-CRP preferred if verified/affordable; generic CRP acceptable for minimum with lower precision
- Ferritin
- Serum iron
- Transferrin or TIBC
- Transferrin saturation (derived or reported)
- 25-OH vitamin D
- RBC magnesium
- Calcitriol / 1,25-(OH)₂D
- Vitamin B12
- Folate
- Homocysteine — recommended minimum because it unlocks methylation value; verify price/coverage

### Thyroid / hormones

- TSH
- Free T4
- Free T3 — recommended minimum for useful thyroid scoring
- For male/recovery profile: total testosterone, SHBG, LH, FSH, estradiol, prolactin if available as a bundle

## Recommended extended Biology Panel

Extended markers should add real scoring value, not act as status-signaling filler.

- ApoB
- Lp(a) — likely one-time cardiovascular baseline rather than repeated frequent marker
- C-peptide
- Fructosamine
- Cystatin C
- Free testosterone / calculated free testosterone
- DHEA-S
- IGF-1
- Creatine kinase (CK)
- Thyroid antibodies: TPOAb, TgAb
- Reverse T3
- MMA
- Copper
- Ceruloplasmin
- Zinc
- Selenium
- PTH
- Omega-3 index / fatty-acid profile
- Fibrinogen
- D-dimer — context-dependent; do not make it routine unless clinically justified
- Calcitriol — extended/special-context only, not routine D-status scoring

## Score-by-score review

| Score | Minimum marker set | Extended markers | Verdict / product rule |
|---|---|---|---|
| Metabolic Flexibility | glucose, HbA1c, triglycerides, HDL, fasting insulin | HOMA-IR derived from glucose+insulin, C-peptide, fructosamine | Strong score. Insulin is minimum for the CZ/EU target because it is common/cheap and materially improves signal. HOMA-IR is derived, not orderable. |
| Thyroid–Mito Signal | TSH, free T3, triglycerides | free T4 context, reverse T3 | Keep minimum small and feasible. Reverse T3 is extended only. |
| Thyroid Coherence | TSH, free T4, free T3 | reverse T3, TPOAb, TgAb, total T3/T4 if supported | Good score if minimum includes FT3/FT4. Antibodies and reverse T3 improve interpretation but must not block. |
| Inflammation & Metabolic Burden | hs-CRP/CRP, GGT, ferritin, bilirubin, vitamin D; optionally uric acid/homocysteine | selenium | Good minimum-friendly score. Selenium should be extended only. hs-CRP vs generic CRP must be honest in provider coverage. |
| Lipid Membrane | none for true membrane score; optionally cheap proxy from TG/HDL is not the same thing | omega-3 index, DHA, EPA, AA/EPA, omega-6/3, full fatty-acid profile | Mark as extended-only unless renamed/split. Do not block Biological Coherence minimum on this. |
| Blood Flow Signals | hematocrit, hemoglobin, platelets, albumin, sodium, CRP/hs-CRP, urea+creatinine derived hydration ratio | fibrinogen, D-dimer | Minimum can be useful as “blood concentration/flow context”; fibrinogen/D-dimer are extended/contextual, not routine. |
| Iron Handling | ferritin, serum iron, transferrin/TIBC, transferrin saturation, hemoglobin, MCV/MCH, CRP/hs-CRP | soluble transferrin receptor, copper, ceruloplasmin | Strong minimum score. sTfR/copper/ceruloplasmin should improve confidence, not block. |
| Methylation | homocysteine, B12, folate, MCV/MCH/RDW, creatinine context | MMA | Strong product score if homocysteine is in minimum. MMA extended only. |
| Fluid & Filtration Coherence | creatinine, eGFR, urea/BUN, sodium, potassium, chloride, albumin | cystatin C + cystatin eGFR | Very minimum-friendly. Cystatin C is valuable extended. |
| Liver–Bile Signal | ALT, AST, GGT, ALP, bilirubin, albumin, platelets, ferritin, triglycerides | none essential | Excellent minimum score; mostly standard markers. |
| Bone–Mineral Signal | 25-OH vitamin D, calcium, phosphorus, ALP, serum magnesium, RBC magnesium, calcitriol, creatinine/eGFR | PTH, bone-turnover markers if later supported | Good minimum score for the CZ target because Michal considers RBC magnesium and calcitriol available/affordable enough. Add PTH as an extended marker. |
| Immune Cell Balance | CBC differential, platelets, CRP/hs-CRP, vitamin D | none essential | Excellent minimum-friendly score. |
| Anabolic Recovery Signal | total testosterone, SHBG, LH, FSH, estradiol, albumin, total protein, hemoglobin, CRP/hs-CRP, vitamin D, TSH/FT3, urea/creatinine | free testosterone, DHEA-S, IGF-1, CK, prolactin | Useful but more budget-sensitive. For male self-pay users, minimum hormone bundle is reasonable; free T/DHEA-S/IGF-1 are extended confidence markers. |

## Current score concerns to fix before Biological Coherence

1. **Lipid Membrane is not minimum-friendly.** It should be explicitly `extended-only` or split into:
   - `Lipid Risk / Atherogenic Signal` from normal lipids + ApoB/Lp(a) optional
   - `Lipid Membrane` from fatty-acid testing only

2. **Metabolic Flexibility should treat fasting insulin as minimum for CZ/EU self-pay users.** HOMA-IR remains derived from glucose + insulin, not orderable.

3. **Thyroid scores must not require reverse T3.** Reverse T3 is extended-only in CZ/EU reality.

4. **Methylation must not require MMA.** Homocysteine + B12 + folate + CBC morphology is enough for minimum; MMA improves B12 specificity.

5. **Bone–Mineral keeps RBC magnesium and calcitriol in minimum for our CZ target.** PTH can be the extended upgrade; provider/pricing layer still needs to verify actual catalogue coverage.

6. **Anabolic Recovery needs sex/context gating.** It is valuable for male/recovery optimization but should not become a universal default score for every user.

7. **Derived markers must stay derived.** HOMA-IR, TG/HDL ratio, BUN/creatinine ratio, NLR, De Ritis ratio, eGFR-derived variants should not appear as orderable tests. Lab ordering must order dependencies.

## Biological Coherence recommendation

Build **Biological Coherence** from minimum-compatible domains only. Do not include extended-only scores as required inputs.

Suggested domain weights:

| Domain | Feeds from | Minimum-ready? |
|---|---|---|
| Metabolic | Metabolic Flexibility, Liver–Bile, Inflammation | yes, with lower confidence if no insulin |
| Immune / inflammation | Immune Cell Balance, Inflammation & Metabolic Burden | yes |
| Blood / oxygen / iron | Iron Handling, Blood Flow Signals | yes |
| Liver / clearance | Liver–Bile Signal | yes |
| Kidney / fluid | Fluid & Filtration Coherence | yes |
| Thyroid / endocrine | Thyroid–Mito, Thyroid Coherence, Anabolic Recovery when applicable | partial; require TSH/FT4/FT3 for thyroid domain |
| Nutrient / mineral | Methylation, Bone–Mineral | yes if homocysteine + D/B12/folate/minerals included |
| Membrane lipids | Lipid Membrane | extended only; do not include in minimum coherence denominator |

UI copy shape:

```txt
Biological Coherence: 78 / 100
Panel depth: Minimum complete
Extended depth: 4 of 17 optional upgrades present
Most valuable next markers: fasting insulin, ApoB, cystatin C
```

If a user lacks enough minimum markers:

```txt
Biological Coherence not ready yet
Needed for a useful minimum score: CBC + differential, fasting glucose/HbA1c/lipids, liver/kidney panel, CRP, ferritin/iron, TSH/FT4/FT3, vitamin D/B12/folate/homocysteine.
```

## Lab-ordering implications

The chat/lab-order flow should derive order bundles from score gaps:

- **Complete my minimum Biology Scores** → order only missing minimum dependencies.
- **Improve my Biological Coherence confidence** → order highest-value extended markers, ranked by number of scores improved and cost/value.
- **Unlock extended scores** → order extended-only panels like fatty-acid profile.

Ranking heuristic for missing markers:

1. Number of scores/domains unlocked or improved.
2. Marker biological value / interpretation strength.
3. CZ/EU verified provider availability and price.
4. Avoid repeated ordering of one-time markers unless stale/relevant.
5. Do not recommend specialty markers before common high-value gaps are filled.

## Candidate new scores after panel cleanup

High-value additions that fit the minimum/extended model:

1. **Atherogenic / Cardiovascular Signal**
   - Minimum: LDL-C, HDL-C, triglycerides, total cholesterol, non-HDL-C derived, CRP, glucose/HbA1c
   - Extended: ApoB, Lp(a)
   - Strongly recommended before/alongside Biological Coherence.

2. **Glycation & Insulin Exposure**
   - Minimum: glucose, HbA1c, triglycerides/HDL
   - Extended: fasting insulin/HOMA-IR, fructosamine, C-peptide
   - Could either be separate from or part of Metabolic Flexibility.

3. **Oxygen Delivery / Anemia Resilience**
   - Minimum: CBC indices + ferritin/iron panel + B12/folate
   - Extended: sTfR, reticulocytes if supported
   - Good minimum-friendly score.

These are more useful for the product than adding exotic detox/toxin scores now.

## Implementation notes

Add score metadata, not more UI complexity:

```js
panelTier: 'minimum' | 'extended',
minimumInputs: ['...'],
extendedInputs: ['...'],
coherenceDomain: 'metabolic' | 'immune' | 'blood' | 'liver' | 'kidney' | 'endocrine' | 'nutrient' | 'membrane',
orderPriority: 'high' | 'medium' | 'low',
```

For each input marker:

```js
panelRole: 'minimum' | 'extended',
orderable: true | false, // false for derived markers
orderDependencies: ['biochemistry.glucose', 'hormones.insulin'],
```

Keep the user-facing tier language simple:

- “Minimum panel”
- “Extended panel”
- “Improves confidence”
- “Calculated after results”

Avoid micro-tier labels in the UI.
