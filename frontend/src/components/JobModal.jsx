import React, { useState, useMemo } from "react";
import {
  X,
  Save,
  AlertTriangle,
  Truck,
  User,
  Package2,
  Wallet,
} from "lucide-react";
import { labelsFor } from "../constants/trailerTaxonomy";

function toLocationNameArray(locations) {
  if (!Array.isArray(locations)) return [];
  return locations.map((l) => (typeof l === "string" ? l : l.name));
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [hh, mm] = String(t).split(":");
  const h = Number(hh || 0);
  const m = Number(mm || 0);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function addHoursToTime(start, hours) {
  const base = timeToMinutes(start);
  const add = Math.round((Number(hours || 0) * 60) / 1); // minutes
  return minutesToTime(base + add);
}

function durationFromStartEnd(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  let diff = e - s;
  // If end is "earlier" than start, it's an overnight job.
  if (diff < 0) diff += 24 * 60;
  // keep to 0.5h steps like before
  const hours = diff / 60;
  return Math.max(0, Math.round(hours * 2) / 2);
}

export default function JobModal({
  job,
  drivers,
  tractors,
  trailers,
  locations,
  isAdmin,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => ({
    ...job,
    driverIds: Array.isArray(job.driverIds) ? job.driverIds : [],
    revenueTrip: job.revenueTrip ?? "",
    costDriver: job.costDriver ?? "",
    costTruck: job.costTruck ?? "",
    costDiesel: job.costDiesel ?? "",
    // دعم بيانات قديمة عندها overrideStart بس
    allowStartOverride: job.allowStartOverride ?? job.overrideStart ?? false,
  }));

  const lastTractorEnd = useMemo(() => {
    return job._lastTractorEnd || null;
  }, [job]);

  const locationNames = toLocationNameArray(locations);

  // UI wants Start + End time, but we keep saving durationHours for backwards-compat.
  const endTime = useMemo(() => {
    return addHoursToTime(form.start || "08:00", Number(form.durationHours || 0));
  }, [form.start, form.durationHours]);

  // endTime is derived from start + durationHours.

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDriver = (driverId) => {
    if (!isAdmin) return;
    setForm((prev) => {
      const current = Array.isArray(prev.driverIds) ? prev.driverIds : [];
      const exists = current.includes(driverId);
      return {
        ...prev,
        driverIds: exists
          ? current.filter((id) => id !== driverId)
          : [...current, driverId],
      };
    });
  };

  const totalCosts =
    (parseFloat(form.costDriver) || 0) +
    (parseFloat(form.costTruck) || 0) +
    (parseFloat(form.costDiesel) || 0);

  const profit =
    (parseFloat(form.revenueTrip) || 0) - (parseFloat(totalCosts) || 0);

  // --- helper لعرض أنواع المقطورة المختارة كبادجز ---
  const selectedTrailer = (trailers || []).find(
    (tr) => String(tr.id) === String(form.trailerId)
  );
  const selectedTrailerTypes = selectedTrailer
    ? Array.isArray(selectedTrailer.types)
      ? selectedTrailer.types
      : selectedTrailer.type
      ? [selectedTrailer.type]
      : []
    : [];
  const selectedTrailerLabels = labelsFor(selectedTrailerTypes);

  const handleSave = () => {
    if (!isAdmin || !onSave) return;
    const payload = {
      ...form,
      // خلي overrideStart دايمًا synced مع allowStartOverride
      overrideStart: form.allowStartOverride,
    };
    onSave(payload);
  };

  const startDisabled =
    !isAdmin ||
    (!form.allowStartOverride &&
      lastTractorEnd &&
      form.startPoint &&
      form.startPoint !== lastTractorEnd);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50/60">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm md:text-base">
              Edit Job
            </h3>
            <p className="text-xs text-gray-500">
              #{job.id} • {job.date} • {job.slot?.toUpperCase?.()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* === 1) basic info + time === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50/50 rounded-lg p-3 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-700 mb-3">
                Basic
              </h4>
              <label className="block mb-2">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Client
                </span>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.client || ""}
                  onChange={(e) => set("client", e.target.value)}
                  disabled={!isAdmin}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    Start Time
                  </span>
                  <input
                    type="time"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start || "08:00"}
                    onChange={(e) => set("start", e.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    End Time
                  </span>
                  <input
                    type="time"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={endTime}
                    onChange={(e) => {
                      const end = e.target.value;
                      const dur = durationFromStartEnd(form.start || "08:00", end);
                      set("durationHours", dur);
                    }}
                    disabled={!isAdmin}
                  />
                </label>
              </div>
            </div>

            {/* === 2) resources === */}
            <div className="bg-gray-50/50 rounded-lg p-3 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
                <Truck size={14} /> Resources
              </h4>

              {/* tractor */}
              <label className="block mb-2">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Tractor
                </span>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.tractorId || ""}
                  onChange={(e) => set("tractorId", e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">— None —</option>
                  {(tractors || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code || t.plate || t.id}
                    </option>
                  ))}
                </select>
              </label>

              {/* trailer */}
              <label className="block mb-2">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Trailer
                </span>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.trailerId || ""}
                  onChange={(e) => set("trailerId", e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">— None —</option>
                  {(trailers || []).map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.code || tr.id}
                    </option>
                  ))}
                </select>

                {selectedTrailerLabels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTrailerLabels.map((lab) => (
                      <span
                        key={lab}
                        className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] border border-emerald-200"
                      >
                        {lab}
                      </span>
                    ))}
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Drivers */}
          <div className="bg-gray-50/40 rounded-lg p-3 border border-gray-100">
            <div>
              <span className="block text-[11px] font-medium text-gray-600 mb-1">
                Drivers
              </span>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {(drivers || []).map((d) => {
                  const checked = form.driverIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDriver(d.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border ${
                        checked
                          ? "bg-purple-50 border-purple-300 text-purple-700"
                          : "bg-white hover:bg-gray-100 border-gray-200 text-gray-600"
                      } ${!isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <User size={12} />
                      {d.name || d.code || d.id}
                    </button>
                  );
                })}
                {(drivers || []).length === 0 && (
                  <p className="text-[11px] text-gray-400">
                    No drivers in system.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="bg-gray-50/40 rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <Package2 size={14} /> Route
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Start Point
                </label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.startPoint || ""}
                  onChange={(e) => set("startPoint", e.target.value)}
                  disabled={startDisabled}
                  placeholder="Type start point..."
                />
                {lastTractorEnd && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Last tractor location:{" "}
                    <span className="font-medium">{lastTractorEnd}</span>
                  </div>
                )}
                <label
                  className={`mt-2 flex items-center gap-2 text-xs ${
                    !isAdmin ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!form.allowStartOverride}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      isAdmin && set("allowStartOverride", e.target.checked)
                    }
                  />
                  Override start point
                </label>
                {form.allowStartOverride &&
                  lastTractorEnd &&
                  form.startPoint &&
                  form.startPoint !== lastTractorEnd && (
                    <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                      <AlertTriangle size={14} /> This job will start away from
                      current tractor position.
                    </div>
                  )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  End Point
                </label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.endPoint || ""}
                  onChange={(e) => set("endPoint", e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Type end point..."
                />
              </div>
            </div>
          </div>

          {/* Financials */}
          <div className="bg-gray-50/40 rounded-lg p-3 border border-gray-100">
            <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <Wallet size={14} /> Financials
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Revenue / Income (trip)
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.revenueTrip}
                  onChange={(e) => set("revenueTrip", e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Cost driver
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.costDriver}
                  onChange={(e) => set("costDriver", e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Cost truck
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.costTruck}
                  onChange={(e) => set("costTruck", e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Cost diesel
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.costDiesel}
                  onChange={(e) => set("costDiesel", e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <div className="px-3 py-2 rounded bg-white border text-gray-700">
                Total costs:{" "}
                <span className="font-semibold">{totalCosts.toFixed(2)}</span>
              </div>
              <div
                className={`px-3 py-2 rounded border ${
                  profit >= 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                Profit:{" "}
                <span className="font-semibold">{profit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        {/* footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/60">
          {isAdmin ? (
            <button
              onClick={() => onDelete && onDelete()}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Delete
            </button>
          ) : (
            <span className="text-[11px] text-gray-400">Read-only view</span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded border text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            {isAdmin && (
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
              >
                <Save size={16} /> Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
