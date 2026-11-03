# Synthetic demo-profile contract

The bundled Alex and Sarah profiles are fictional examples, including their
clinician-directed prescriptions. They support exploration and regression tests;
their doses, monitoring dates and responses are not recommendations or population
predictions. Existing saved profiles are never rewritten when a demo template changes.

`js/demo-treatment-data.ts` owns their dated treatment scenarios. The static JSON
and rolling loader use the same builder. After compiling, run
`node scripts/refresh-demo-treatments.mjs` to refresh the bundled JSON. The operation
is deterministic and idempotent. `prepareDemoBiologyData` clones and shifts the
complete scenario, including prescription periods, observations and notes, only
when creating a fresh demo.

## Treatment histories

Offsets below are days before the latest lab panel. Eight follow-up panels span
406 days; retained older panels remain historical data. Responses begin after the
documented prescription dates. A follow-up result never authorizes an app-created
treatment change.

| Profile | History | Benefit | Tolerability and uncertainty |
| --- | --- | --- | --- |
| Alex | Atorvastatin 20 mg/day, started 338 days before the latest panel after persistent high LDL/ApoB and a documented family history of premature coronary disease | LDL falls from 4.40 to 2.55 mmol/L at the first 48-day follow-up, with a sustained ApoB reduction | Intermittent muscle aches occur alongside increased cycling, with normal CK and no established drug causality. HbA1c rises modestly with pre-existing metabolic risk; the data do not establish its cause. |
| Sarah | Primary hypothyroidism with low FT4, elevated TSH and positive TPO antibodies. Clinician-directed levothyroxine 50→75→50 µg/day, starting 338 days before the latest panel, increasing at day −280 and decreasing at day −164 | Thyroid biochemistry and symptoms improve; the current dose has stable follow-up results | The 75 µg phase includes suppressed TSH, high FT4, palpitations and heat intolerance. These prompted documented clinician review and reduction. This is not a desirable wellness or weight-loss target. |

Sarah's recorded routine separates levothyroxine from iron by more than four
hours. Thyroid samples precede the morning dose, with the lab's biotin/B-complex
instructions recorded. Natural-cycle context is retained; thyroid replacement is
not represented as contraception or sex-hormone treatment.

## Coherence and verification

The builder reconciles HOMA-IR, lipid totals/non-HDL/ratios, CBC indices and iron
availability with their component measurements. The synthetic iron calculation
uses an approximate 25.1 µmol/L binding capacity per g/L transferrin; this fixture
rule does not change patient-data import or laboratory interpretation. Stored
native calculated-ratio snapshots are removed so the ordinary derived views own
them. Historical and current notes, goals, context summaries and Focus copy must
not describe an unstarted medicine as absent after treatment starts.

The source data, rolling dates, dose-period continuity, biochemical relationships,
real profile migration, chat context, browser import/export/reload and rendered
medication cards are covered by `demo-treatment-data.test.ts`, the existing demo
tests and `tests/playwright/demo-biology.spec.ts`. These checks establish internal
fixture coherence, not clinical validation or safe behavior of every AI model.
Demo loading must not generate paid AI calls automatically.

## Clinical references

- [Levothyroxine prescribing information](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=66a3bd4a-770b-4f67-bfa7-6d5e23f2ecbf): response timing, clinician monitoring, absorption interactions and over-replacement effects.
- [Atorvastatin prescribing information](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c6e131fe-e7df-4876-83f7-9156fc4e8228): lipid lowering, muscle symptoms and glycemic effects.
- [AHA/ACC dyslipidemia guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001423): individual treatment response, follow-up and evaluation of muscle symptoms.
- [RCPA iron-studies reporting protocol](https://www.rcpa.edu.au/Library/Practising-Pathology/NCRPQF/Docs/Iron-Studies-Standardised-Reporting-Protocol.aspx): transferrin-saturation calculations and laboratory reporting context.
