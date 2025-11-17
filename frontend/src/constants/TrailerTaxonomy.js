// src/constants/trailerTaxonomy.js
export const TRAILER_TAXONOMY = [
  {
    label: "Box",
    value: "box",
    children: [
      { label: "box onderklep 2 Asser", value: "box_onderklep_2_asser" },
      { label: "box onderklep 3 Asser", value: "box_onderklep_3_asser" },
      { label: "box grote klep", value: "box_grote_klep" },
    ],
  },
  {
    label: "Frigo",
    value: "frigo",
    children: [
      { label: "frigo onderklep", value: "frigo_onderklep" },
      {
        label: "frigo werkt niet onderklep",
        value: "frigo_werkt_niet_onderklep",
      },
      {
        label: "frigo onderklep werkt niet",
        value: "frigo_onderklep_werkt_niet",
      },
      { label: "frigo grote klep", value: "frigo_grote_klep" },
      {
        label: "frigo werkt niet grote klep",
        value: "frigo_werkt_niet_grote_klep",
      },
      {
        label: "frigo grote klep werkt niet",
        value: "frigo_grote_klep_werkt_niet",
      },
    ],
  },
  {
    label: "Tautliner",
    value: "tautliner",
    children: [
      { label: "Tautliner onderklep", value: "tautliner_onderklep" },
      { label: "Tautliner zonder klep", value: "tautliner_zonder_klep" },
    ],
  },
];

// Helper لتحويل values -> labels للعرض
export function labelsFor(values = []) {
  const map = new Map();
  TRAILER_TAXONOMY.forEach((g) => {
    map.set(g.value, g.label);
    (g.children || []).forEach((c) => map.set(c.value, c.label));
  });
  return values.map((v) => map.get(v) || v);
}
