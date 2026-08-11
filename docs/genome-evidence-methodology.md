# Genome evidence methodology

The genome catalog is a wellness-education feature. It can expose useful genotype context, but it is not a diagnostic report, a pathogenic-variant classifier, or a polygenic risk score.

## Two independent axes

Every SNP entry is graded on two axes. They must not be collapsed into one severity label.

### Evidence strength

- **Strong / replicated:** replicated human evidence, a large meta-analysis or GWAS, or a well-established functional variant supports the narrowly worded catalog claim.
- **Supported:** credible human or functional evidence supports the claim, with meaningful population, design, replication, or effect-size limitations.
- **Mixed evidence:** relevant studies disagree, or functional evidence has not produced a consistent human phenotype.
- **Preliminary:** the claim relies on a small, single, ancestry-specific, or otherwise limited human study and needs replication.
- **Mechanistic only:** laboratory or molecular work supports a mechanism but not a reliable personal health outcome.

“Strong” applies only to the scoped claim. It does not mean clinically severe, highly penetrant, diagnostic, or actionable.

### Personal relevance

- **Health / lab context:** interpret with biomarkers, symptoms, family history, medications, or professional guidance. Genotype alone is not a diagnosis.
- **Context-dependent:** diet, exposure, behavior, ancestry, or environment materially changes the practical meaning.
- **Trait only:** educational phenotype or biochemical context; no health action follows from the genotype alone.

Risk and protective labels describe association direction, not absolute risk or a recommendation. “Protective association” does not mean universally beneficial.

## Claim-level review

One catalog entry must state what its references actually support. Reviewers should check:

1. rsID, alleles, genome strand, and genotype direction;
2. whether the SNP is functional, a tag marker in linkage disequilibrium, or one component of a haplotype;
3. study design, sample size, ancestry, phenotype, effect size, confidence interval, and replication;
4. whether a cited result is a biomarker association, health association, exposure interaction, trait, mechanism, or null/mixed finding;
5. whether wording stays inside the studied population and outcome;
6. whether relevant null or contradictory human evidence changes the grade;
7. whether a measured biomarker is more informative than the genotype;
8. whether the source was reviewed from metadata/abstract only or from accessible full text and supporting tables.

GWAS significance establishes an association in a study; it does not by itself establish causality, clinical importance, or genotype-specific actionability. Common wellness SNPs should not be given ACMG/AMP pathogenicity labels intended for Mendelian disease variants.

## Catalog schema

Each SNP in `data/snp-health.json` requires:

- at least one publication URL in `references`;
- `evidence.level`, `evidence.claimTypes`, `evidence.scope`, and `evidence.reviewedAt`;
- `relevance.level` and `relevance.context`;
- forward-strand interpretation or an explicit strand limitation;
- genotype notes that avoid diagnosis, deterministic predictions, and unsupported intervention claims.

The legacy genotype `effect` field remains for recommendation compatibility and old stored imports. It is a historical internal prioritization field, not the displayed evidence grade and not a substitute for effect size.

`relevance.context` is deterministic catalog guidance about conditions that change interpretation. It is not generated from the user's profile and must be labeled “Interpretation context” in the UI, not “Personal context.” Personalized synthesis belongs in an explicit AI interaction, where the model can combine this baseline with the user's available data and broader knowledge.

When an effect size is quoted, the note must identify what it represents and avoid converting a population average into a personal prediction. Exact odds ratios, beta values, confidence intervals, sample sizes, and ancestry should be added as structured fields only after checking the primary paper or its supplementary tables.

## Adding or changing a SNP

1. Define one narrow claim before looking for a favorable citation.
2. Prefer replicated human evidence, meta-analyses, large GWAS, functional primary studies, ClinGen, ClinVar expert review, or established pharmacogenetic guidance as appropriate to the claim.
3. Read the abstract and inspect full text or supporting tables when allele direction, effect size, cohort, linkage, or interpretation is ambiguous.
4. Record the strongest material limitation and retain relevant null or conflicting evidence.
5. Grade evidence and personal relevance independently.
6. Add or update focused catalog, parser, AI-context, and browser-rendering tests.
7. Re-review when a source is corrected or retracted, a stronger study changes the direction, or the catalog wording expands.

User suggestions and corrections must concern the public catalog only. Public issue links must never include the user’s genotype, raw DNA, labs, location, profile, or health notes.
