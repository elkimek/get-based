import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

// Exclusive autosomal preview receivers only; shared shell/axes remain native.
export const dnaSnpPreviewOwnership = {
  "receivers": [
    [
      "dna-snp-preview-apoe",
      ".dna-preview-apoe",
      null
    ],
    [
      "dna-snp-preview-group",
      ".dna-preview-group",
      null
    ],
    [
      "dna-snp-preview-group-title",
      ".dna-preview-group-title",
      null
    ],
    [
      "dna-snp-preview-row",
      ".dna-preview-row",
      null
    ],
    [
      "dna-snp-preview-icon",
      ".dna-preview-icon",
      null
    ],
    [
      "dna-snp-preview-gene",
      ".dna-preview-gene",
      null
    ],
    [
      "dna-snp-preview-variant",
      ".dna-preview-variant",
      null
    ],
    [
      "dna-snp-preview-category",
      ".dna-preview-category",
      null
    ],
    [
      "dna-snp-preview-genotype",
      ".dna-preview-genotype",
      null
    ],
    [
      "dna-snp-preview-note",
      ".dna-preview-note",
      null
    ],
    [
      "dna-snp-preview-assessment",
      ".dna-preview-assessment",
      null
    ],
    [
      "dna-snp-preview-collapsible",
      ".dna-preview-collapsible",
      null
    ],
    [
      "dna-snp-preview-expand-hint",
      ".dna-preview-expand-hint",
      null
    ],
    [
      "dna-snp-preview-collapsed-items",
      ".dna-preview-collapsed-items",
      null
    ],
    [
      "dna-snp-preview-expanded-items",
      ".dna-preview-group.expanded .dna-preview-collapsed-items",
      null
    ],
    [
      "dna-snp-preview-expanded-hint",
      ".dna-preview-group.expanded .dna-preview-expand-hint",
      null
    ]
  ],
  "declarationCount": 49,
  "compactMetadataPrefix": true,
  "isolateRecipes": true
} as const satisfies NativeStyleOwnership;
