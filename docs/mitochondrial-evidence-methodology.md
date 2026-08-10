# Mitochondrial evidence methodology

The supplements dashboard uses a deliberately small, claim-level evidence catalog. It is not a list of every substance ever mentioned alongside mitochondria and it is not a medication safety database.

## Inclusion rule

An evidence record may be shown only when all of the following are true:

1. The citation is a primary study, not a review, editorial, commentary, or unrelated paper.
2. The study directly measures a mitochondrial endpoint relevant to the displayed sentence (for example respiration, a respiratory-chain complex, mitochondrial protein synthesis, membrane potential, mtDNA leakage, mitophagy, or mitochondrial biogenesis).
3. The displayed sentence does not claim more mechanisms, compounds, tissues, doses, or outcomes than that study supports.
4. The record names the actual model and exposure context.
5. The record states the most important model-to-user limitation.
6. The PMID and paper title have been checked against PubMed.
7. A null or mixed result is retained when it is the strongest direct human evidence found; the catalog is not positive-results-only.

One PMID is attached to one scoped evidence statement. A paper can support more than one compound only when the experiment actually tested each one; each compound still gets its own wording.

## Evidence labels and UI behavior

- **Human RCT:** randomized intervention in people. The UI still shows population, duration, intervention, and limitations.
- **Human observational / withdrawal:** measurements in treated people without randomized causal evidence. Adverse human RCTs and adverse human observational records can appear as a human caution signal; the limitation still states what that design cannot establish.
- **Human mechanistic intervention:** a supplement was given to people and a direct mitochondrial endpoint was measured, but the design cannot establish a clinical benefit (for example, a small uncontrolled pre/post or tissue study).
- **Human cells / ex vivo:** human-derived cells or tissue studied outside the body. This is mechanistic evidence, not a clinical effect.
- **Translational preclinical:** multiple cell/animal models, sometimes with a human biomarker correlation. Causal laboratory results remain preclinical.
- **Animal, isolated tissue, or isolated mitochondria:** a mechanism in that exact model. Never proof of benefit or harm at a user's dose.

Direction pills are deliberately literal: **Potential benefit**, **Human caution signal**, **Adverse lab signal**, **Mechanism, not harm**, **Mixed finding**, and **No effect detected**. A scope pill calls out narrow conditions such as overdose, a named formulation, a disease population, or a historical dose. None of these labels is a diagnosis or a recommendation to start or stop treatment.

A compound appears only once at the top level. When it has multiple qualifying studies, expanding that compound shows every claim separately; direction, scope, population, exposure, limitation, and PMID are never merged into a synthetic conclusion. The AI context uses the same compound grouping while retaining each included study record.

The AI context repeats these limitations, includes the scope when present, caps matches, and explicitly prohibits interpreting preclinical findings as personalized harm/benefit or recommending that a prescription be stopped.

Each displayed record also offers a prefilled public GitHub correction issue. It includes only the public catalog claim and citation; tracked product names, doses, schedules, notes, and other user health data are excluded.

## Matching rules

- Match structured generic names, product names, and active ingredients.
- Do not match the free-form brand field.
- Trade names are recognized only when explicitly curated as aliases for a verified compound.
- Return every active-ingredient match in a combination product; do not stop at the first match.
- Short abbreviations are exact-only.
- Normalize Unicode and punctuation so matching does not depend on ASCII word boundaries.
- Combination-intervention evidence is not assigned to either component alone. For example, GlyNAC trial evidence matches GlyNAC, not standalone glycine or NAC.

## Automatic exclusion

Do not publish records based on:

- review articles used as if they were primary evidence;
- a PMID that resolves to an unrelated paper;
- cancer-cell cytotoxicity generalized to ordinary human use;
- overdose or supratherapeutic experiments generalized to a recorded routine dose;
- disease-model rescue generalized to benefit in healthy people;
- a class effect assigned to an individual drug that was not tested;
- an indirect nutrient deficiency presented as a direct mitochondrial drug effect;
- a single citation stretched across additional mechanisms not measured in the study;
- a formulation-specific result matched to a broader nutrient family (for example, magnesium chloride evidence matched to magnesium glycinate);
- quality-certificate contaminants, excipients, or capsule materials masquerading as active compounds.

## Adding or changing an entry

1. Find the primary study and verify the PMID/title pair on PubMed.
2. Read the methods and results needed to establish model, exposure, direction, and measured endpoint. If the abstract is insufficient, do not infer the missing detail.
3. Write the narrowest faithful summary and an explicit limitation.
4. Add one `evidence` object with a stable ID and run the focused mitochondrial evidence unit and browser specs.
5. Re-review records when a source is corrected/retracted or stronger human evidence changes the interpretation.

The catalog metadata records its verification date. A stale schema-v1 catalog is ignored at runtime because its entry-level citations cannot substantiate every displayed claim.
