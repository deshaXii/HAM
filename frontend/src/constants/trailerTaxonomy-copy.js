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

/* ========= Helpers ========= */

// ابحث بسرعة
const familyByValue = new Map(TRAILER_TAXONOMY.map((g) => [g.value, g]));
const childToFamily = new Map();
TRAILER_TAXONOMY.forEach((f) => {
  (f.children || []).forEach((c) => childToFamily.set(c.value, f.value));
});

/** هل المسار صالح؟ [family, variant] */
export function isValidPath(path = []) {
  if (!Array.isArray(path) || path.length < 2) return false;
  const fam = familyByValue.get(path[0]);
  if (!fam) return false;
  return (fam.children || []).some((c) => c.value === path[1]);
}

/** labelsForPath(['box','box_grote_klep']) => ['Box','box grote klep'] */
export function labelsForPath(path = []) {
  if (!Array.isArray(path) || path.length === 0) return [];
  const [famVal, childVal] = path;
  const fam = familyByValue.get(famVal);
  if (!fam) return [];
  if (!childVal) return [fam.label];
  const child = (fam.children || []).find((c) => c.value === childVal);
  return child ? [fam.label, child.label] : [fam.label];
}

export function normalizeToPath(any) {
  if (isValidPath(any)) return any;
  if (typeof any === "string") {
    const fam = childToFamily.get(any);
    return fam ? [fam, any] : [];
  }
  if (Array.isArray(any) && any.length) {
    // اختَر أول عنصر child ونحاول نلاقي أسرته
    const firstChild = any.find((v) => childToFamily.has(v));
    if (firstChild) return [childToFamily.get(firstChild), firstChild];
  }
  return [];
}

/* متوافقة للخلفية مع دالتك السابقة (لو كود قديم بيناديها) */
export function labelsFor(values = []) {
  return labelsForPath(normalizeToPath(values));
}
