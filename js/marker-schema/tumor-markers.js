// @ts-check
// Stable built-in tumor markers marker category.

export const TUMOR_MARKERS_CATEGORY = {
  label: "Tumor Markers", icon: "\uD83D\uDD2C",
  markers: {
    psa: { name: "PSA", unit: "\u00b5g/l", refMin: 0.003, refMax: 1.400, desc: "Prostate-specific antigen; used to screen for prostate cancer and monitor treatment, though also elevated in benign conditions." },
    afp: { name: "AFP (Alpha-Fetoprotein)", unit: "kU/l", refMin: 0.0, refMax: 7.5, desc: "Alpha-fetoprotein; a plasma protein normally produced by the developing fetus, clinically utilized as a tumor marker and reproductive screening assay." }
  }
};
