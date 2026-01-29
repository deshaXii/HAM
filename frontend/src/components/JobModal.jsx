import React, { useState, useMemo, useRef } from "react";
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
import { jobShortKey } from "../lib/jobKey";

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


function addHoursToDateTime(dateISO, startTime, hours) {
  // returns { endDate: 'YYYY-MM-DD', endTime: 'HH:MM' }
  const [y, mo, d] = String(dateISO || "").slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !mo || !d) return { endDate: dateISO || "", endTime: minutesToTime(timeToMinutes(startTime || "00:00")) };

  const [hhStr, mmStr] = String(startTime || "00:00").split(":");
  const hh = parseInt(hhStr || "0", 10);
  const mm = parseInt(mmStr || "0", 10);

  const base = new Date(y, (mo || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  const durMs = (Number(hours || 0) * 60 * 60 * 1000);
  const end = new Date(base.getTime() + durMs);

  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  return { endDate, endTime };
}

function durationHoursBetween(startDateISO, startTime, endDateISO, endTime) {
  if (!startDateISO || !endDateISO || !startTime || !endTime) return 0;

  const startDT = new Date(`${String(startDateISO).slice(0, 10)}T${startTime}:00`);
  const endDT = new Date(`${String(endDateISO).slice(0, 10)}T${endTime}:00`);
  if (Number.isNaN(startDT.getTime()) || Number.isNaN(endDT.getTime())) return 0;

  const diffMin = Math.round((endDT.getTime() - startDT.getTime()) / 60000);
  if (diffMin < 0) return -1;
  return Math.round((diffMin / 60) * 100) / 100; // 2 decimals
}

function isValidHexColor(c) {
  const s = String(c || "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveErrorField, setSaveErrorField] = useState("");

  const shortKey = jobShortKey(job?.id);

  const tractorRef = useRef(null);
  const trailerRef = useRef(null);
  const driversRef = useRef(null);
  const routeRef = useRef(null);
  const financialRef = useRef(null);
  const [form, setForm] = useState(() => {
  const base = {
    ...job,
    driverIds: Array.isArray(job.driverIds) ? job.driverIds : [],
    revenueTrip: job.revenueTrip ?? "",
    costDriver: job.costDriver ?? "",
    costTruck: job.costTruck ?? "",
    costDiesel: job.costDiesel ?? "",
    // دعم بيانات قديمة عندها overrideStart بس
    allowStartOverride: job.allowStartOverride ?? job.overrideStart ?? false,
    code: job.code ?? "",
    color: job.color ?? "",
  };

  const derived = addHoursToDateTime(base.date, base.start || "08:00", Number(base.durationHours || 0));
  return {
    ...base,
    endDate: base.endDate || derived.endDate || base.date,
    endTime: base.endTime || derived.endTime || "16:00",
  };
});


  const lastTractorEnd = useMemo(() => {
    return job._lastTractorEnd || null;
  }, [job]);

  const locationNames = toLocationNameArray(locations);

  const scrollToField = (field) => {
    const map = {
      tractor: tractorRef,
      trailer: trailerRef,
      drivers: driversRef,
      route: routeRef,
      financial: financialRef,
      time: null,
      general: null,
    };
    const ref = map[field];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const showError = (field, message) => {
    setSaveError(String(message || "Save failed"));
    setSaveErrorField(field || "general");
    scrollToField(field || "general");
  };

  const clearErrorIfRelated = (key) => {
    if (!saveErrorField) return;
    const related =
      (key === "tractorId" && saveErrorField === "tractor") ||
      (key === "trailerId" && saveErrorField === "trailer") ||
      ((key === "driverIds" || key === "_drivers") && saveErrorField === "drivers") ||
      ((key === "startPoint" || key === "endPoint" || key === "allowStartOverride") && saveErrorField === "route") ||
      ((key === "revenueTrip" || key === "costDriver" || key === "costTruck" || key === "costDiesel") &&
        saveErrorField === "financial");
    if (related) {
      setSaveError("");
      setSaveErrorField("");
    }
  };

  const set = (key, value) => {
    clearErrorIfRelated(key);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDriver = (driverId) => {
    if (!isAdmin) return;
    setForm((prev) => {
      const current = Array.isArray(prev.driverIds) ? prev.driverIds : [];
      const exists = current.includes(driverId);

      // removing is always allowed
      if (exists) {
        return {
          ...prev,
          driverIds: current.filter((id) => id !== driverId),
        };
      }

      // --- business rules: max drivers + 2-man eligibility ---
      const tractor = (tractors || []).find(
        (t) => String(t.id) === String(prev.tractorId)
      );
      const tractorAllowsTwo = tractor ? tractor.doubleManned === true : null;
      const maxDrivers = tractorAllowsTwo === false ? 1 : 2;

      if (current.length >= maxDrivers) {
        showError(
          "drivers",
          maxDrivers === 1
            ? "This tractor allows only 1 driver."
            : "A job can have at most 2 drivers."
        );
        return prev;
      }

      // if adding a second driver, both drivers must be 2-man eligible
      if (current.length === 1) {
        const existing = (drivers || []).find(
          (d) => String(d.id) === String(current[0])
        );
        const incoming = (drivers || []).find(
          (d) => String(d.id) === String(driverId)
        );
        if (existing?.doubleMannedEligible === false) {
          showError(
            "drivers",
            `Driver "${existing?.name || existing?.id}" is not eligible for 2-man jobs.`
          );
          return prev;
        }
        if (incoming?.doubleMannedEligible === false) {
          showError(
            "drivers",
            `Driver "${incoming?.name || incoming?.id}" is not eligible for 2-man jobs.`
          );
          return prev;
        }
      }

      return {
        ...prev,
        driverIds: [...current, driverId],
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

  const handleSave = async () => {
    if (!isAdmin || !onSave) return;
    setSaveError("");
    setSaveErrorField("");
    setSaving(true);
try {
  // validate explicit end date/time (allows multi-day)
  const durCheck = durationHoursBetween(form.date, form.start || "08:00", form.endDate, form.endTime);
  if (durCheck < 0) {
    showError("time", "End date/time must be after Start time.");
    setSaving(false);
    return;
  }
  // keep durationHours synced with explicit end
  const syncedForm = { ...form, durationHours: durCheck > 0 ? durCheck : Number(form.durationHours || 0) };



      const payload = {
        ...syncedForm,
        // خلي overrideStart دايمًا synced مع allowStartOverride
        overrideStart: syncedForm.allowStartOverride,
      };
      const res = await onSave(payload);
      if (res?.ok === false) {
        showError(res.field || "general", res.reason || "Save failed");
      }
    } catch (e) {
      const msg =
        e?.reason ||
        e?.message ||
        e?.response?.data?.message ||
        "Save failed. Please try again.";
      showError("general", msg);
    } finally {
      setSaving(false);
    }
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
              {shortKey ? `#${shortKey} • ` : ""}#{job.id} • {job.date} • {job.slot?.toUpperCase?.()}
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
          {saveError && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
              <AlertTriangle size={18} className="mt-0.5" />
              <div>
                <div className="font-medium">Cannot save</div>
                <div className="text-xs mt-0.5">{saveError}</div>
              </div>
            </div>
          )}
          {/* === 1) basic info + time === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50/50 rounded-lg p-3 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-700 mb-3">
                Basic
              </h4>
              <label ref={tractorRef} className="block mb-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    Start Time
                  </span>
                  <input
                    type="time"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start || "08:00"}
                    onChange={(e) => {
                      const v = e.target.value;
                      const dur = durationHoursBetween(form.date, v, form.endDate, form.endTime);
                      set("start", v);
                      if (dur >= 0) set("durationHours", dur);
                    }}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="block">
  <span className="block text-[11px] font-medium text-gray-600 mb-1">
    End Date
  </span>
  <input
    type="date"
    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    value={form.endDate || form.date}
    onChange={(e) => {
      const v = e.target.value;
      set("endDate", v);
      const dur = durationHoursBetween(form.date, form.start || "08:00", v, form.endTime);
      if (dur >= 0) set("durationHours", dur);
    }}
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
    value={form.endTime || "16:00"}
    onChange={(e) => {
      const v = e.target.value;
      set("endTime", v);
      const dur = durationHoursBetween(form.date, form.start || "08:00", form.endDate, v);
      if (dur >= 0) set("durationHours", dur);
    }}
    disabled={!isAdmin}
  />
</label>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    Job Code
                  </span>
                  <input
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.code || ""}
                    onChange={(e) => set("code", e.target.value)}
                    disabled={!isAdmin}
                    placeholder="e.g. AB12X9"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    Card Color
                  </span>
                  {/* Color picker row: stay within section width */}
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <input
                      type="color"
                      className="h-10 w-14 border rounded-md shrink-0 cursor-pointer"
                      value={isValidHexColor(form.color) ? form.color : "#3B82F6"}
                      onChange={(e) => set("color", e.target.value)}
                      disabled={!isAdmin}
                      title="Pick a color"
                    />
                    <input
                      className="min-w-0 w-full border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.color || ""}
                      onChange={(e) => set("color", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="#RRGGBB"
                    />
                  </div>
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
                  className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    saveErrorField === "tractor" ? "ring-2 ring-red-500 border-red-300" : ""
                  }`}
                  value={form.tractorId || ""}
                  onChange={(e) => set("tractorId", e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">— None —</option>
                  {(tractors || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {(t.code || t.id) + (t.plate ? ` • ${t.plate}` : "")}
                    </option>
                  ))}
                </select>
              </label>

              {/* trailer */}
              <label ref={trailerRef} className="block mb-2">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  Trailer
                </span>
                <select
                  className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    saveErrorField === "trailer" ? "ring-2 ring-red-500 border-red-300" : ""
                  }`}
                  value={form.trailerId || ""}
                  onChange={(e) => set("trailerId", e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">— None —</option>
                  {(trailers || []).map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {(tr.code || tr.id) + (tr.plate ? ` • ${tr.plate}` : "")}
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
          <div
            ref={driversRef}
            className={`bg-gray-50/40 rounded-lg p-3 border ${
              saveErrorField === "drivers" ? "border-red-300 ring-2 ring-red-500" : "border-gray-100"
            }`}
          >
            <div>
              <span className="block text-[11px] font-medium text-gray-600 mb-1">
                Drivers
              </span>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {(drivers || []).map((d) => {
                  const checked = form.driverIds.includes(d.id);
                  const tractor = (tractors || []).find(
                    (t) => String(t.id) === String(form.tractorId)
                  );
                  const tractorAllowsTwo = tractor ? tractor.doubleManned === true : null;
                  const maxDrivers = tractorAllowsTwo === false ? 1 : 2;
                  const currentCount = form.driverIds.length;
                  let blocked = false;
                  let blockedReason = "";

                  if (!checked) {
                    if (currentCount >= maxDrivers) {
                      blocked = true;
                      blockedReason =
                        maxDrivers === 1
                          ? "This tractor allows only 1 driver"
                          : "Max 2 drivers per job";
                    } else if (currentCount === 1) {
                      const existing = (drivers || []).find(
                        (x) => String(x.id) === String(form.driverIds[0])
                      );
                      if (existing?.doubleMannedEligible === false) {
                        blocked = true;
                        blockedReason = "Existing driver not 2-man eligible";
                      } else if (d?.doubleMannedEligible === false) {
                        blocked = true;
                        blockedReason = "Driver not 2-man eligible";
                      }
                    }
                  }
                  const disabled = !isAdmin || blocked;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        if (disabled) {
                          if (blockedReason) showError("drivers", blockedReason);
                          return;
                        }
                        toggleDriver(d.id);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border ${
                        checked
                          ? "bg-purple-50 border-purple-300 text-purple-700"
                          : "bg-white hover:bg-gray-100 border-gray-200 text-gray-600"
                      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={blockedReason || ""}
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
          <div
            ref={routeRef}
            className={`bg-gray-50/40 rounded-lg p-3 border ${
              saveErrorField === "route" ? "border-red-300 ring-2 ring-red-500" : "border-gray-100"
            }`}
          >
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
          <div
            ref={financialRef}
            className={`bg-gray-50/40 rounded-lg p-3 border ${
              saveErrorField === "financial" ? "border-red-300 ring-2 ring-red-500" : "border-gray-100"
            }`}
          >
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
                disabled={saving}
                className={`inline-flex items-center gap-2 text-white text-sm px-4 py-2 rounded ${
                  saving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Save size={16} /> {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
