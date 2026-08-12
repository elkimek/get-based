// @ts-check
// Stable built-in tumor markers marker category.

export const TUMOR_MARKERS_CATEGORY = {
  label: "Tumor Markers", icon: "\uD83D\uDD2C",
  markers: {
    psa: { name: "PSA", unit: "\u00b5g/l", refMin: 0.003, refMax: 1.400, desc: "Prostate-specific antigen; used to screen for prostate cancer and monitor treatment, though also elevated in benign conditions." },
    afp: { name: "AFP (Alpha-Fetoprotein)", unit: "kU/l", refMin: 0.0, refMax: 7.5, desc: "Alpha-fetoprotein; a plasma protein normally produced by the developing fetus, clinically utilized as a tumor marker and reproductive screening assay." },
    cea: { name: "CEA", unit: "\u00b5g/l", refMin: 0, refMax: 3.0, desc: "Carcinoembryonic antigen used mainly for treatment monitoring and recurrence surveillance; smoking and benign conditions can raise it." },
    ca125: { name: "CA 125", unit: "kU/l", refMin: 0, refMax: 35, desc: "Tumor-associated antigen used mainly to monitor ovarian cancer; many benign gynecologic and inflammatory conditions can elevate it." },
    ca199: { name: "CA 19-9", unit: "kU/l", refMin: 0, refMax: 35, desc: "Tumor-associated antigen used mainly for pancreatic and biliary cancer monitoring; obstruction and inflammation can also elevate it." },
    ca153: { name: "CA 15-3", unit: "kU/l", refMin: 0, refMax: 30, desc: "Tumor-associated antigen used mainly for monitoring some breast cancers; it is not a stand-alone screening or diagnostic test." }
  }
};
