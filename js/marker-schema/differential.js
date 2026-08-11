// @ts-check
// Stable built-in differential marker category.

export const DIFFERENTIAL_CATEGORY = {
  label: "WBC Differential", icon: "\uD83E\uDDA0",
  markers: {
    neutrophils: { name: "Neutrophils #", unit: "10^9/l", refMin: 2.0, refMax: 7.0, desc: "The most abundant white blood cells; the first responders to bacterial infection, elevated in acute inflammation." },
    lymphocytes: { name: "Lymphocytes #", unit: "10^9/l", refMin: 0.8, refMax: 4.0, desc: "Immune cells (T-cells, B-cells, NK cells) driving adaptive immunity; elevated in viral infections, low in immunodeficiency." },
    monocytes: { name: "Monocytes #", unit: "10^9/l", refMin: 0.08, refMax: 1.20, desc: "White blood cells that become macrophages in tissues; elevated in chronic infections, autoimmune diseases, and recovery." },
    eosinophils: { name: "Eosinophils #", unit: "10^9/l", refMin: 0.0, refMax: 0.5, desc: "White blood cells that fight parasites and mediate allergic responses; elevated in allergies, asthma, and parasitic infections." },
    basophils: { name: "Basophils #", unit: "10^9/l", refMin: 0.0, refMax: 0.2, desc: "The rarest white blood cells involved in allergic reactions and histamine release; markedly elevated in some blood cancers." },
    neutrophilsPct: { name: "Neutrophils %", unit: "", refMin: 0.45, refMax: 0.70, desc: "Proportion of white blood cells that are neutrophils; shifts in percentage help distinguish bacterial from viral infections." },
    lymphocytesPct: { name: "Lymphocytes %", unit: "", refMin: 0.20, refMax: 0.45, desc: "Proportion of white blood cells that are lymphocytes; relatively elevated in viral infections and lymphoproliferative disorders." },
    monocytesPct: { name: "Monocytes %", unit: "", refMin: 0.02, refMax: 0.12, desc: "Proportion of white blood cells that are monocytes; elevated in chronic inflammation, tuberculosis, and recovery phases." },
    eosinophilsPct: { name: "Eosinophils %", unit: "", refMin: 0.00, refMax: 0.05, desc: "Proportion of white blood cells that are eosinophils; elevated percentages are commonly associated with allergic, asthmatic, and parasitic patterns." },
    basophilsPct: { name: "Basophils %", unit: "", refMin: 0.00, refMax: 0.02, desc: "Proportion of white blood cells that are basophils; small shifts can appear with allergic inflammation or some myeloproliferative patterns." }
  }
};
