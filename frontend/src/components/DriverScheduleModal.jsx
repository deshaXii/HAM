import React, { useState } from "react";
import { X } from "lucide-react";

/**
 * props:
 * - drivers: array from state.drivers
 * - onSave(updatedDriversArray): callback -> هيعمل persistIfAdmin
 * - onClose(): يغلق المودال
 *
 * كل driver هنمسك له:
 *  name
 *  canNight: boolean
 *  weekAvailability: numbers [0..6] (0=Sun,1=Mon,...)
 *  leaves: ["2025-10-20","2025-10-21", ...]
 */
export default function DriverScheduleModal({ drivers, onSave, onClose }) {
  // نشتغل على نسخة محلية قبل الحفظ
  const [draft, setDraft] = useState(
    (drivers || []).map((d) => ({
      ...d,
      canNight: !!d.canNight,
      weekAvailability: Array.isArray(d.weekAvailability)
        ? [...d.weekAvailability]
        : [1, 2, 3, 4, 5], // default: Mon-Fri
      leaves: Array.isArray(d.leaves) ? [...d.leaves] : [],
    }))
  );

  const daysOrder = [
    { label: "Mon", val: 1 },
    { label: "Tue", val: 2 },
    { label: "Wed", val: 3 },
    { label: "Thu", val: 4 },
    { label: "Fri", val: 5 },
    { label: "Sat", val: 6 },
    { label: "Sun", val: 0 },
  ];

  function toggleDay(idxDriver, dayVal) {
    setDraft((prev) =>
      prev.map((drv, i) => {
        if (i !== idxDriver) return drv;
        const exists = drv.weekAvailability.includes(dayVal);
        return {
          ...drv,
          weekAvailability: exists
            ? drv.weekAvailability.filter((d) => d !== dayVal)
            : [...drv.weekAvailability, dayVal],
        };
      })
    );
  }

  function toggleNight(idxDriver) {
    setDraft((prev) =>
      prev.map((drv, i) =>
        i === idxDriver ? { ...drv, canNight: !drv.canNight } : drv
      )
    );
  }

  function updateLeaves(idxDriver, text) {
    // textarea comma/space/newline separated -> array of ISO dates
    const parts = text
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    setDraft((prev) =>
      prev.map((drv, i) => (i === idxDriver ? { ...drv, leaves: parts } : drv))
    );
  }

  function handleSave() {
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* خلفية غامقة */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

      {/* الصندوق */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Driver Availability / Schedule
            </h2>
            <p className="text-xs text-gray-500">
              حدد لكل سائق الأيام اللي بيشتغلها، يسمح ليل؟ وإجازاته.
            </p>
          </div>

          <button
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="space-y-6">
          {draft.length === 0 ? (
            <div className="text-sm text-gray-500">لا يوجد سائقين مسجلين.</div>
          ) : (
            draft.map((drv, idx) => (
              <div
                key={drv.id || idx}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {drv.name || drv.code || `Driver ${drv.id}`}
                    </div>
                    <div className="text-xs text-gray-500">ID: {drv.id}</div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={drv.canNight}
                      onChange={() => toggleNight(idx)}
                    />
                    <span>Can work night shifts</span>
                  </label>
                </div>

                {/* Week availability */}
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-700 mb-2">
                    Working days in week
                    <span className="text-gray-400 font-normal">
                      {" "}
                      (check = available)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {daysOrder.map((d) => (
                      <label
                        key={d.val}
                        className={`flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer ${
                          drv.weekAvailability.includes(d.val)
                            ? "bg-blue-50 border-blue-400 text-blue-700"
                            : "bg-white border-gray-300 text-gray-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={drv.weekAvailability.includes(d.val)}
                          onChange={() => toggleDay(idx, d.val)}
                        />
                        <span>{d.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Leaves */}
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Leaves / Off days (YYYY-MM-DD)
                  </div>
                  <textarea
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="2025-10-20 2025-10-21 2025-12-01 ..."
                    value={drv.leaves.join(" ")}
                    onChange={(e) => updateLeaves(idx, e.target.value)}
                  />
                  <div className="text-[10px] text-gray-500 mt-1">
                    اكتب التواريخ مفصولة بمسافة أو فاصلة. أي تاريخ هنا = السواق
                    أجازة كاملة اليوم.
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* footer */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            className="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-4 py-2 rounded-lg border border-gray-300"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="text-sm font-semibold flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow"
            onClick={handleSave}
          >
            Save Schedules
          </button>
        </div>
      </div>
    </div>
  );
}
