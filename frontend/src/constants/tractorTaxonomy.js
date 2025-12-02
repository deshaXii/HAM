// src/constants/trailerTaxonomy.js
export const TRACTOR_TAXONOMY = [
  {
    label: "Ham",
    value: "ham",
  },
  {
    label: "Ham + milieu",
    value: "Ham_milieu",
  },
  {
    label: "Ham + milieu + wabco",
    value: "Ham_milieu_wabco",
  },

  {
    label: "Kuijpers",
    value: "kuijpers ",
  },
  {
    label: "Kuijpers + milieu",
    value: "Kuijpers_milieu",
  },
  {
    label: "Kuijpers + milieu + wabco",
    value: "Kuijpers_milieu_wabco",
  },

  {
    label: "Truckland",
    value: "truckland",
  },
  {
    label: "Truckland + milieu",
    value: "Truckland_milieu",
  },

  {
    label: "Truckland + milieu + wabco",
    value: "Truckland_milieu_wabco",
  },
  {
    label: "School + milieu",
    value: "School_milieu",
  },
  {
    label: "School + milieu + wabco",
    value: "School_milieu_wabco",
  },
  {
    label: "unknown",
    value: "unknown",
  },
];

/* ========= Helpers ========= */

// ابحث بسرعة
const familyByValue = new Map(TRACTOR_TAXONOMY.map((g) => [g.value, g]));
const childToFamily = new Map();
TRACTOR_TAXONOMY.forEach((f) => {
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
