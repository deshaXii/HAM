import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const DAYS = [
  { label: "Mon", val: 1 },
  { label: "Tue", val: 2 },
  { label: "Wed", val: 3 },
  { label: "Thu", val: 4 },
  { label: "Fri", val: 5 },
  { label: "Sat", val: 6 },
  { label: "Sun", val: 0 },
];

/*
props:
 - drivers: state.drivers (array)
 - onSaveDrivers(nextDriversArray): function
    -> In parent (e.g., admin screen) you would do:
       persistIfAdmin({ ...state, drivers: nextDriversArray })
*/

function initialsOf(name) {
  return (
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function AdminDriverSchedule({ drivers, onSaveDrivers }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [local, setLocal] = useState(
    (drivers || []).map((d) => ({
      id: d.id,
      name: d.name || "",
      code: d.code || "",
      photoUrl: d.photoUrl || "", // <-- مهم لعرض الصورة
      canNight: !!d.canNight,
      twoManOk: !!d.twoManOk,
      weekAvailability: Array.isArray(d.weekAvailability)
        ? d.weekAvailability
        : [1, 2, 3, 4, 5],
      leaves: Array.isArray(d.leaves) ? d.leaves : [],
    }))
  );

  if (!isAdmin) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Only admin can edit driver schedules.
      </div>
    );
  }

  function toggleDay(driverId, dayVal) {
    setLocal((prev) =>
      prev.map((drv) => {
        if (drv.id !== driverId) return drv;
        const has = drv.weekAvailability.includes(dayVal);
        return {
          ...drv,
          weekAvailability: has
            ? drv.weekAvailability.filter((d) => d !== dayVal)
            : [...drv.weekAvailability, dayVal],
        };
      })
    );
  }

  function toggleField(driverId, field) {
    setLocal((prev) =>
      prev.map((drv) =>
        drv.id === driverId ? { ...drv, [field]: !drv[field] } : drv
      )
    );
  }

  function updateLeaves(driverId, value) {
    const dates = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setLocal((prev) =>
      prev.map((drv) => (drv.id === driverId ? { ...drv, leaves: dates } : drv))
    );
  }

  function saveAll() {
    onSaveDrivers &&
      onSaveDrivers(
        local.map((d) => ({
          ...d,
          // نحافظ على نفس الشكل اللي بتستخدمه بقية الصفحات
        }))
      );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Driver Availability / Schedule
        </h2>
        <button
          onClick={saveAll}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow"
        >
          Save
        </button>
      </div>

      {local.length === 0 && (
        <div className="text-sm text-gray-500 text-center">
          No drivers found.
        </div>
      )}

      <div className="space-y-4">
        {local.map((drv) => (
          <div
            key={drv.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
          >
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar (صورة أو اختصار الاسم) */}
                {drv.photoUrl ? (
                  <img
                    src={drv.photoUrl}
                    alt={drv.name || "driver"}
                    className="h-10 w-10 rounded-full object-cover border border-gray-200 flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initialsOf(drv.name)}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-gray-900 font-semibold text-sm truncate">
                    {drv.name || "(no name)"}{" "}
                    <span className="text-gray-500 font-normal">
                      {drv.code ? `• ${drv.code}` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    Driver ID: {drv.id}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drv.canNight}
                    onChange={() => toggleField(drv.id, "canNight")}
                  />
                  <span className="text-gray-700">Night Shift OK</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drv.twoManOk}
                    onChange={() => toggleField(drv.id, "twoManOk")}
                  />
                  <span className="text-gray-700">2-man Eligible</span>
                </label>
              </div>
            </div>

            {/* Week availability */}
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-800 mb-2">
                Works on days:
              </div>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d.val}
                    onClick={() => toggleDay(drv.id, d.val)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                      drv.weekAvailability.includes(d.val)
                        ? "bg-blue-50 border-blue-400 text-blue-700"
                        : "bg-gray-50 border-gray-300 text-gray-500"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                If day is not checked → driver should not work on this day.
              </div>
            </div>

            {/* Leaves */}
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-800 mb-2">
                Leave days (comma-separated ISO dates):
              </div>
              <textarea
                className="w-full border border-gray-300 rounded-lg text-xs p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={drv.leaves.join(", ")}
                rows={2}
                onChange={(e) => updateLeaves(drv.id, e.target.value)}
                placeholder="2025-10-21, 2025-11-01"
              />
              <div className="text-[11px] text-gray-500 mt-1">
                Driver is not allowed to be assigned on these days at all.
              </div>
            </div>

            <div className="text-[11px] text-gray-500 border-t pt-2">
              - Night Shift OK = Can work night shifts.
              <br />- 2-man Eligible = This driver is allowed to be part of
              2-driver teams (but tractor must also be doubleManned).
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
