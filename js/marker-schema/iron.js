// @ts-check
// Stable built-in iron marker category.

export const IRON_CATEGORY = {
  label: "Iron Metabolism", icon: "\uD83D\uDD34",
  markers: {
    iron: { name: "Iron", unit: "\u00b5mol/l", refMin: 5.8, refMax: 34.5, refMin_f: 6.6, refMax_f: 26.0, desc: "Serum iron level reflecting current iron availability; fluctuates with meals and inflammation, best interpreted with ferritin." },
    ferritin: { name: "Ferritin", unit: "\u00b5g/l", refMin: 30, refMax: 400, refMin_f: 13, refMax_f: 150, desc: "The primary iron storage protein; the most reliable marker for total body iron stores, though elevated by inflammation." },
    transferrin: { name: "Transferrin", unit: "g/l", refMin: 2.0, refMax: 3.6, desc: "The iron transport protein in blood; rises when iron stores are low as the body tries to capture more iron." },
    tibc: { name: "TIBC", unit: "\u00b5mol/l", refMin: 22.3, refMax: 61.7, desc: "Total iron-binding capacity of transferrin; high values suggest iron deficiency, low values suggest iron overload." },
    transferrinSat: { name: "Transferrin Sat.", unit: "%", refMin: 16.0, refMax: 45.0, desc: "Percentage of transferrin loaded with iron; low values confirm iron deficiency, high values suggest overload risk." },
    solubleTransferrinReceptor: { name: "Soluble Transferrin Receptor", unit: "mg/l", refMin: 0.76, refMax: 1.76, desc: "Reflects cellular iron demand and erythropoietic activity; useful when ferritin is distorted by inflammation." }
  }
};
