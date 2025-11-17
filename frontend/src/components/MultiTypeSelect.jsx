import React, { useMemo, useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import {
  TRAILER_TAXONOMY,
  labelsForPath,
  normalizeToPath,
} from "../constants/trailerTaxonomy";

export default function MultiTypeSelect({
  value = [], // نتوقع [family, variant] أو أي قيمة قديمة هنطبّعها
  onChange,
  placeholder = "Select type…",
}) {
  const path = normalizeToPath(value); // [family, variant] أو []
  const familyVal = path[0] || "";
  const variantVal = path[1] || "";

  const [open, setOpen] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState(familyVal || ""); // افتح الأسرة المختارة

  const containerRef = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // لو القيمة تغيّرت من الأب، ساير التوسيع
  useEffect(() => {
    if (familyVal && expandedFamily !== familyVal) setExpandedFamily(familyVal);
  }, [familyVal]); // eslint-disable-line

  const summaryText = useMemo(() => {
    const labs = labelsForPath(path);
    return labs.length ? labs.join(" → ") : placeholder;
  }, [path, placeholder]);

  function toggleFamily(fVal) {
    setExpandedFamily((prev) => (prev === fVal ? "" : fVal));
    // 👇 مهم: لا نستدعي onChange هنا؛ الاختيار الحقيقي عند variant فقط
  }

  function chooseVariant(vVal) {
    const fam = familyVal || expandedFamily;
    if (!fam) return;
    onChange([fam, vVal]);
    setOpen(false); // إغلاق بعد الاختيار
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border rounded px-3 py-2 text-sm bg-white hover:bg-gray-50"
      >
        <span className={path.length ? "text-gray-700" : "text-gray-400"}>
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
          {TRAILER_TAXONOMY.map((group) => {
            const isOpen = (expandedFamily || familyVal) === group.value;

            return (
              <div key={group.value} className="mb-2">
                {/* زر العائلة: يوسّع/يطوي فقط */}
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

                {/* خيارات الـ variant: اختيار واحد */}
                {isOpen && (
                  <div className="pl-6 mt-1 space-y-1">
                    {(group.children || []).map((ch) => {
                      const selected =
                        variantVal === ch.value &&
                        (familyVal || expandedFamily) === group.value;
                      return (
                        <label
                          key={ch.value}
                          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm ${
                            selected ? "bg-emerald-50" : "hover:bg-gray-50"
                          }`}
                          onClick={() => chooseVariant(ch.value)}
                        >
                          <input
                            type="radio"
                            name="trailer-variant"
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
