# Biological Age

Biological age estimates how old your body appears based on blood markers — as opposed to your chronological age. getbased computes it automatically from two published models and presents a single combined result.

## Two Clocks, One Number

getbased calculates biological age using two independently validated models:

**PhenoAge** (Levine et al. 2018) — a mortality-calibrated model using 9 biomarkers. Trained on NHANES III data, it estimates biological age through a mortality risk score. Widely used in longevity research.

**Bortz Age** (Bortz et al. 2023, Nature Communications) — an aging-acceleration model using 22 biomarkers. Trained on UK Biobank data, it estimates how fast your body is aging through a weighted linear combination.

When both can be calculated, getbased averages them for a more robust estimate. When only one has sufficient inputs, it uses that one. The detail modal shows which components contributed.

## Biomarkers

### PhenoAge (9 markers)

| Marker | Category |
|--------|----------|
| Albumin | Protein |
| Creatinine | Kidney |
| Glucose | Metabolic |
| CRP | Inflammation |
| Lymphocytes % | Immune |
| MCV | Hematology |
| RDW-CV | Hematology |
| ALP | Liver |
| WBC | Immune |

### Bortz Age (22 markers, including age)

| Marker | Category |
|--------|----------|
| Albumin, ALT, ALP, GGT | Liver |
| Creatinine, Cystatin C, Urea | Kidney |
| Glucose, HbA1c, Total Cholesterol, ApoA-I | Metabolism |
| CRP | Inflammation |
| WBC, RBC, MCV, MCH, RDW | Hematology |
| Neutrophils, Monocytes, Lymphocytes % | Immune |
| SHBG, Vitamin D | Hormones |

Bortz Age uses more inputs but is more forgiving — a standard CBC + metabolic panel covers most of them. PhenoAge requires all 9 on the same date. Both require **hs-CRP specifically** — standard CRP has a different detection range and substituting it would corrupt the age estimate.

::: warning
Both models require **all their inputs on the same blood draw date**. If any marker is missing for a given date, no value is calculated. The detail view shows exactly which inputs are missing. Both also require your **date of birth** in Settings → Profile.
:::

## Where to Find It

Biological Age appears in the **Calculated Ratios** category in the sidebar. The chart shows:

- A **solid line** for your Biological Age at each draw date
- A **dashed line** for your chronological age at the time of each draw
- The gap between the two — the key number to watch

## Interpreting Your Score

There is no fixed reference range. What matters is the relationship between your Biological Age and your actual age:

- **Biological Age < chronological age** — your body is aging slower than average
- **Biological Age = chronological age** — average
- **Biological Age > chronological age** — your body is aging faster than average

The trend over time matters more than any single reading.

::: tip
The detail modal shows the breakdown — PhenoAge and Bortz Age components, with their individual deltas from chronological age. If only one clock could calculate, it tells you which inputs the other is missing.
:::

## hs-CRP/HDL Ratio

Also in Calculated Ratios, this composite marker divides hs-CRP (inflammation) by HDL cholesterol (protection). It captures cardiovascular risk better than either marker alone — a patient can have mildly elevated CRP and borderline-low HDL, each unremarkable alone, but the ratio reveals a pro-atherogenic state.

| Risk | Ratio |
|---|---|
| Optimal | < 0.24 |
| Normal | < 0.94 |
| Elevated | > 0.94 |

This ratio requires hs-CRP specifically (standard CRP lacks precision at low values).

## In AI Chat

When you discuss Biological Age in the AI chat, the AI receives both component scores alongside your chronological age and can interpret the gap, note the trend, and suggest which contributing markers to focus on.

## Attribution

The Biological Age implementation was inspired by the [Longevity World Cup](https://longevityworldcup.com) project. Bortz Age coefficients sourced from their open implementation of the Bortz et al. 2023 model.
