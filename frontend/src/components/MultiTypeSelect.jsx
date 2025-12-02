import React, { useMemo, useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";

/* ===== Generic helpers that work for BOTH flat and nested taxonomies ===== */
function buildLookups(taxonomy = []) {
  const familyByVal = new Map();
  const childToFamily = new Map();
  const anyChildren = taxonomy.some(
    (g) => Array.isArray(g.children) && g.children.length > 0
  );

  taxonomy.forEach((g) => {
    familyByVal.set(g.value, g);
    (g.children || []).forEach((c) => childToFamily.set(c.value, g.value));
  });

  return { anyChildren, familyByVal, childToFamily };
}

function normalizeToPathGeneric(taxonomy, value) {
  const { anyChildren, familyByVal, childToFamily } = buildLookups(taxonomy);

  if (!anyChildren) {
    // FLAT MODE: value could be ["ham"] or "ham" -> return ["ham"]
    if (Array.isArray(value) && value.length) return [String(value[0])];
    if (typeof value === "string" && value) return [value];
    return [];
  }

  // NESTED MODE (family → child)
  // Accept: ["family","child"] OR "child" OR ["child1","child2",...]
  if (Array.isArray(value) && value.length >= 2) {
    const famVal = value[0];
    const childVal = value[1];
    const fam = familyByVal.get(famVal);
    if (fam && (fam.children || []).some((c) => c.value === childVal)) {
      return [famVal, childVal];
    }
  }

  if (typeof value === "string") {
    const fam = childToFamily.get(value);
    if (fam) return [fam, value];
  }

  if (Array.isArray(value) && value.length) {
    const firstChild = value.find((v) => childToFamily.has(v));
    if (firstChild) return [childToFamily.get(firstChild), firstChild];
  }

  return [];
}

function labelsForPathGeneric(taxonomy, path = []) {
  const { anyChildren, familyByVal } = buildLookups(taxonomy);

  if (!anyChildren) {
    // FLAT MODE
    const v = path[0];
    const item = taxonomy.find((t) => t.value === v);
    return item ? [item.label] : [];
  }

  // NESTED MODE
  const [famVal, childVal] = path;
  const fam = familyByVal.get(famVal);
  if (!fam) return [];
  if (!childVal) return [fam.label];
  const ch = (fam.children || []).find((c) => c.value === childVal);
  return ch ? [fam.label, ch.label] : [fam.label];
}
/* ======================================================================== */

export default function MultiTypeSelect({
  value = [],
  onChange,
  taxonomy = [],
  placeholder = "Select type…",
}) {
  const path = normalizeToPathGeneric(taxonomy, value);
  const summaryText = useMemo(() => {
    const labs = labelsForPathGeneric(taxonomy, path);
    return labs.length ? labs.join(" → ") : placeholder;
  }, [taxonomy, path, placeholder]);

  const { anyChildren } = useMemo(() => buildLookups(taxonomy), [taxonomy]);

  const [open, setOpen] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState(path[0] || "");
  const containerRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (path[0] && expandedFamily !== path[0]) setExpandedFamily(path[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path[0]]);

  function chooseFlat(vVal) {
    // نعيده كـ ["value"] عشان يركب على تخزينك الحالي (array)
    onChange([vVal]);
    setOpen(false);
  }

  function toggleFamily(fVal) {
    setExpandedFamily((prev) => (prev === fVal ? "" : fVal));
  }

  function chooseVariant(fVal, vVal) {
    onChange([fVal, vVal]); // nested path
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border rounded px-3 py-2 text-sm bg-white hover:bg-gray-50"
      >
        <span
          className={
            path.length ? "text-gray-700 truncate" : "text-gray-400 truncate"
          }
        >
          {summaryText}
        </span>
        {open ? (
          <ChevronUp size={16} className="text-gray-500" />
        ) : (
          <ChevronDown size={16} className="text-gray-500" />
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg p-2 max-h-72 overflow-auto">
          {/* FLAT MODE */}
          {!anyChildren &&
            taxonomy.map((item) => {
              const selected = path[0] === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => chooseFlat(item.value)}
                  className={`w-full text-left px-2 py-1 rounded text-sm ${
                    selected
                      ? "bg-emerald-50 text-emerald-700"
                      : "hover:bg-gray-50 text-gray-800"
                  }`}
                >
                  {selected ? "− " : "+ "}
                  {item.label}
                </button>
              );
            })}

          {/* NESTED MODE */}
          {anyChildren &&
            taxonomy.map((group) => {
              const isOpen = (expandedFamily || path[0]) === group.value;
              return (
                <div key={group.value} className="mb-2">
                  <button
                    type="button"
                    onClick={() => toggleFamily(group.value)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm font-semibold ${
                      isOpen
                        ? "bg-blue-50 text-blue-700"
                        : "hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                    {group.label}
                  </button>
                  {isOpen && (
                    <div className="pl-6 mt-1 space-y-1">
                      {(group.children || []).map((ch) => {
                        const selected =
                          path[0] === group.value && path[1] === ch.value;
                        return (
                          <label
                            key={ch.value}
                            className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm ${
                              selected ? "bg-emerald-50" : "hover:bg-gray-50"
                            }`}
                            onClick={() => chooseVariant(group.value, ch.value)}
                          >
                            <input
                              type="radio"
                              name={`variant-${group.value}`}
                              checked={!!selected}
                              readOnly
                            />
                            <span className="text-gray-700">{ch.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
