import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { resolveDriverPhotoUrl } from "../lib/photoUrl";

const DAYS = [
  { label: "Mon", val: 1 },
  { label: "Tue", val: 2 },
  { label: "Wed", val: 3 },
  { label: "Thu", val: 4 },
  { label: "Fri", val: 5 },
  { label: "Sat", val: 6 },
  { label: "Sun", val: 0 },
];

// ===== Helpers =====
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

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseISO(s) {
  const [y, m, d] = String(s)
    .split("-")
    .map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function datesBetween(fromISO, toISOstr) {
  if (!fromISO || !toISOstr) return [];
  let start = parseISO(fromISO);
  let end = parseISO(toISOstr);
  if (isNaN(start) || isNaN(end)) return [];

  // لو المستخدم اخترعكس: From > To، نبدّلهم
  if (start.getTime() > end.getTime()) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const out = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cur.getTime() <= last.getTime()) {
    out.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ===== Component =====
/* props:
  - drivers: state.drivers
  - onSaveDrivers(nextDriversArray): function
*/
export default function AdminDriverSchedule({ drivers, onSaveDrivers, selectedId = null }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ✅ Normalize drivers + اجعل الافتراضي كل الأيام [0..6]
  const normalized = useMemo(
    () => {
      const list = (drivers || []).map((d) => ({
        id: d.id,
        name: d.name || "",
        code: d.code || "",
        photoUrl: d.photoUrl || "",
        canNight: !!d.canNight,
        sleepsInCab: !!d.sleepsInCab,
        doubleMannedEligible: !!d.doubleMannedEligible,
        weekAvailability: Array.isArray(d.weekAvailability)
          ? d.weekAvailability
          : [0, 1, 2, 3, 4, 5, 6],
        leaves: Array.isArray(d.leaves) ? d.leaves : [],
      }));

      return list;
    },
    [drivers, selectedId]
  );

  const [local, setLocal] = useState(normalized);

  // Debounced push-up so the page-level Save/auto-save owns persistence.
  const didMountRef = useRef(false);
  const pushTimerRef = useRef(null);

  function normalizeOut(list) {
    return (Array.isArray(list) ? list : []).map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      photoUrl: d.photoUrl,
      canNight: !!d.canNight,
      sleepsInCab: !!d.sleepsInCab,
      doubleMannedEligible: !!d.doubleMannedEligible,
      weekAvailability: Array.isArray(d.weekAvailability)
        ? d.weekAvailability.slice().sort()
        : [0, 1, 2, 3, 4, 5, 6],
      leaves: Array.isArray(d.leaves) ? d.leaves.slice().sort() : [],
    }));
  }

  useEffect(() => {
    // keep local in sync when drivers prop changes (e.g., reload)
    setLocal(normalized);
  }, [normalized]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!onSaveDrivers) return;

    // Skip the first push on mount so we don't save immediately on load.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      onSaveDrivers(normalizeOut(local));
    }, 450);

    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [local, isAdmin, onSaveDrivers]);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const visibleDrivers = useMemo(() => {
    if (!selectedId) return local;
    const picked = (local || []).find((d) => d.id === selectedId);
    return picked ? [picked] : local;
  }, [local, selectedId]);


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

  function addLeaveRange(driverId) {
    const list = datesBetween(rangeFrom, rangeTo);
    if (!list.length) return;

    setLocal((prev) =>
      prev.map((drv) =>
        drv.id === driverId
          ? {
              ...drv,
              // دمج + إزالة تكرار + ترتيب
              leaves: Array.from(
                new Set([...(drv.leaves || []), ...list])
              ).sort(),
            }
          : drv
      )
    );
    setRangeFrom("");
    setRangeTo("");
  }

  function removeLeaveDate(driverId, dateISO) {
    setLocal((prev) =>
      prev.map((drv) =>
        drv.id === driverId
          ? { ...drv, leaves: (drv.leaves || []).filter((d) => d !== dateISO) }
          : drv
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Driver Availability / Schedule</h2>
        <div className="text-xs text-gray-500">Edits auto-save via the page Save controls</div>
      </div>

      {local.length === 0 && (
        <div className="text-sm text-gray-500 text-center">
          No drivers found.
        </div>
      )}

      <div className="space-y-4">
        {visibleDrivers.map((drv) => (
          <div
            key={drv.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
          >
            {/* header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {drv.photoUrl ? (
                  <img
                    src={resolveDriverPhotoUrl(drv.photoUrl)}
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

              <div className="flex items-center gap-4 text-xs flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drv.canNight}
                    onChange={() => toggleField(drv.id, "canNight")}
                  />
                  <span className="text-gray-700">Night shift OK</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drv.sleepsInCab}
                    onChange={() => toggleField(drv.id, "sleepsInCab")}
                  />
                  <span className="text-gray-700">Sleeps in cab</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={drv.doubleMannedEligible}
                    onChange={() => toggleField(drv.id, "doubleMannedEligible")}
                  />
                  <span className="text-gray-700">2-man eligible</span>
                </label>
              </div>
            </div>

            {/* days */}
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
                If a day is not checked → driver should not be auto-assigned on
                this day.
              </div>
            </div>

            {/* leave range */}
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-800 mb-2">
                Leave days:
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-500 mb-1">From</label>
                  <input
                    type="date"
                    className="border border-gray-300 rounded-lg text-xs p-2"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    className="border border-gray-300 rounded-lg text-xs p-2"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => addLeaveRange(drv.id)}
                  className="bg-gray-800 text-white text-xs font-medium px-3 py-2 rounded-lg"
                >
                  Add Range
                </button>
              </div>

              {/* chips of leaves */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(drv.leaves || []).length === 0 ? (
                  <span className="text-[11px] text-gray-400">
                    No leave days
                  </span>
                ) : (
                  (drv.leaves || []).map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px]"
                    >
                      {d}
                      <button
                        onClick={() => removeLeaveDate(drv.id, d)}
                        className="text-red-600 hover:text-red-800"
                        title="Remove date"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="text-[11px] text-gray-500 mt-2">
                Select a date range (From → To). All days in the range will be
                blocked.
              </div>
            </div>

            <div className="text-[11px] text-gray-500 border-t pt-2">
              - Night shift OK = can be used in night jobs. <br />
              - Sleeps in cab = can do overnight trips requiring cab. <br />-
              2-man eligible = driver can be on double-manned jobs (tractor must
              allow double man too).
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}