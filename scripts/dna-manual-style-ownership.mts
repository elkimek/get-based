import {remainingFeatureOwnership} from './remaining-feature-style-ownership.mjs';
import {dnaSnpPreviewOwnership} from './dna-snp-preview-style-ownership.mjs';
import {geneticsSectionOwnership} from './genetics-section-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';

// Shared preview shell remains custom CSS; unused legacy manual grid/genotype rules are removed.
export const dnaManualOwnership = {
  receivers: [
    ["dna-manual-dialog", ".dna-manual-modal", null],
    ["dna-manual-header", ".dna-manual-header", null],
    ["dna-manual-body", ".dna-manual-snp-body", null],
    ["dna-manual-card", ".dna-manual-card", null],
    ["dna-manual-bulk-card", ".dna-manual-card-bulk", null],
    ["dna-manual-section-head", ".dna-manual-section-head", null],
    ["dna-manual-section-title", ".dna-manual-section-head span", null],
    ["dna-manual-section-hint", ".dna-manual-section-head small", null],
    ["dna-manual-field", ".dna-manual-field", null],
    ["dna-manual-source", ".dna-manual-source", null],
    ["dna-manual-controls", ".dna-manual-input,\n.dna-manual-textarea", null],
    ["dna-manual-input", ".dna-manual-input", null],
    ["dna-manual-textarea", ".dna-manual-textarea", null],
    ["dna-manual-placeholder", ".dna-manual-input::placeholder,\n.dna-manual-textarea::placeholder", null],
    ["dna-manual-hover", ".dna-manual-input:hover,\n.dna-manual-textarea:hover", null],
    ["dna-manual-focus", ".dna-manual-input:focus,\n.dna-manual-textarea:focus", null],
    ["dna-manual-help", ".dna-manual-help", null],
    ["dna-manual-section-head-phone", ".dna-manual-section-head", "(max-width: 560px)"],
    ["dna-manual-section-hint-phone", ".dna-manual-section-head small", "(max-width: 560px)"],
  ],
  declarationCount: 62, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export const mtDnaPreviewOwnership = {
  receivers: [
    ["mtdna-preview-haplogroup", ".mtdna-preview-haplogroup", null],
    ["mtdna-preview-hg-label", ".mtdna-hg-label", null],
    ["mtdna-preview-hg-value", ".mtdna-hg-value", null],
    ["mtdna-preview-hg-counts", ".mtdna-hg-confidence", null],
    ["mtdna-preview-coupling", ".mtdna-preview-coupling", null],
    ["mtdna-preview-coupling-label", ".mtdna-coupling-label", null],
    ["mtdna-preview-coupling-climate", ".mtdna-coupling-climate", null],
    ["mtdna-preview-coupling-description", ".mtdna-coupling-desc", null],
    ["mtdna-preview-mismatch", ".mtdna-preview-mismatch", null],
    ["mtdna-preview-mismatch-significant", ".mtdna-mismatch-significant", null],
    ["mtdna-preview-mismatch-moderate", ".mtdna-mismatch-moderate", null],
    ["mtdna-preview-mismatch-implications", ".mtdna-mismatch-implications", null],
    ["mtdna-preview-match", ".mtdna-preview-match", null],
  ],
  declarationCount: 45, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

// One pass owns the three import surfaces and complete Genetics section; keep the existing builder API stable.
export const geneticsPresentationOwnership = {
  receivers: [...dnaManualOwnership.receivers, ...mtDnaPreviewOwnership.receivers, ...dnaSnpPreviewOwnership.receivers, ...geneticsSectionOwnership.receivers, ...remainingFeatureOwnership.genetics.receivers],
  declarationCount: dnaManualOwnership.declarationCount + mtDnaPreviewOwnership.declarationCount + dnaSnpPreviewOwnership.declarationCount + geneticsSectionOwnership.declarationCount + remainingFeatureOwnership.genetics.declarationCount,
  compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export function compileDnaManualStyles(input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input, inputPath, root, geneticsPresentationOwnership);
}
