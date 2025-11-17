// src/components/MultiTypeSelect.jsx
import React, { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";

export default function MultiTypeSelect({
  taxonomy,
  value = [],
  onChange,
  placeholder = "Select types...",
}) {
  const [open, setOpen] = useState(false);
  const valSet = useMemo(() => new Set(value), [value]);

  const toggle = (v) => {
    const next = new Set(valSet);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(Array.from(next));
  };

  const toggleGroup = (group) => {
    const children = (group.children || []).map((c) => c.value);
    const allOn = children.every((v) => valSet.has(v));
    const next = new Set(valSet);
    children.forEach((v) => (allOn ? next.delete(v) : next.add(v)));
    onChange(Array.from(next));
  };

  const summary = () => {
    if (!value.length) return placeholder;
    return `${value.length} selected`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border rounded px-2 py-1.5 text-sm bg-white hover:bg-gray-50"
      >
        <span className="truncate text-gray-700">{summary()}</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg p-2 max-h-72 overflow-auto">
          {taxonomy.map((group) => {
            const children = group.children || [];
            const allOn =
              children.length > 0 && children.every((v) => valSet.has(v.value));
            const someOn = !allOn && children.some((v) => valSet.has(v.value));
            return (
              <div key={group.value} className="mb-2">
                <label className="flex items-center gap-2 font-semibold text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => el && (el.indeterminate = someOn)}
                    onChange={() => toggleGroup(group)}
                  />
                  {group.label}
                </label>
                <div className="pl-6 mt-1 space-y-1">
                  {children.map((ch) => (
                    <label
                      key={ch.value}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={valSet.has(ch.value)}
                        onChange={() => toggle(ch.value)}
                      />
                      {ch.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
