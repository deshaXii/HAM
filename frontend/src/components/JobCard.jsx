// front/src/components/JobCard.jsx
import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Euro,
  AlertTriangle,
  Truck,
  Users,
  Copy,
} from "lucide-react";
import { jobShortKey } from "../lib/jobKey";

const STATUS_COLORS = {
  incomplete: "bg-gray-400",
  waiting: "bg-yellow-400",
  processed_soon: "bg-orange-500",
  processed: "bg-blue-500",
  complete: "bg-green-600",
};

function computeJobStatus(job) {
  if (
    !job ||
    !job.date ||
    !job.start ||
    !job.durationHours ||
    !job.pickup ||
    !job.dropoff ||
    !Array.isArray(job.driverIds) ||
    job.driverIds.length === 0 ||
    !job.tractorId
  ) {
    return "incomplete";
  }
  const start = new Date(`${job.date}T${job.start}:00`);
  const end = new Date(
    start.getTime() + (Number(job.durationHours) || 0) * 3600 * 1000
  );
  const now = new Date();

  if (now >= end) return "complete";
  if (now >= start && now < end) return "processed";
  const oneHourBefore = new Date(start.getTime() - 60 * 60 * 1000);
  if (now >= oneHourBefore && now < start) return "processed_soon";
  return "waiting";
}

/**
 * نطلع كل التحذيرات (conflicts) لجوب معيّن بناءً على الـ resources.
 */
export function getJobWarnings(job, resources) {
  const drivers = resources?.drivers || [];
  const tractors = resources?.tractors || [];
  const trailers = resources?.trailers || [];

  const getDriver = (id) => drivers.find((d) => String(d.id) === String(id));
  const getTractor = (id) => tractors.find((t) => String(t.id) === String(id));
  const getTrailer = (id) => trailers.find((t) => String(t.id) === String(id));

  const out = [];

  if (job.slot === "night") {
    (job.driverIds || []).forEach((driverId) => {
      const driver = getDriver(driverId);
      if (driver && !driver.canNight)
        out.push(`${driver.name} cannot work night shifts`);
    });
  }

  if ((job.driverIds || []).length > 1) {
    const tractor = getTractor(job.tractorId);
    if (tractor && !tractor.doubleManned)
      out.push("Tractor not suitable for 2 drivers");
  }

  if (!job.tractorId) out.push("Missing tractor");
  if (!job.trailerId) out.push("Missing trailer");
  if (!job.driverIds || job.driverIds.length === 0) out.push("Missing driver");
  if (!job.durationHours || job.durationHours === 0)
    out.push("Missing duration");

  if (!job.start) out.push("Missing start time");

  return out;
}

function isJobCompleted(job) {
  if (!job?.date) return false;

  const [y, m, d] = String(job.date)
    .split("-")
    .map((n) => parseInt(n, 10));
  if (!y || !m || !d) return false;

  const [hhStr, mmStr] = String(job.start || "00:00").split(":");
  const hh = parseInt(hhStr || "0", 10);
  const mm = parseInt(mmStr || "0", 10);

  const base = new Date();
  base.setFullYear(y);
  base.setMonth(m - 1);
  base.setDate(d);
  base.setHours(hh, mm || 0, 0, 0);

  const durMs = (job.durationHours || 0) * 60 * 60 * 1000;
  const end = new Date(base.getTime() + durMs);

  return end.getTime() <= Date.now();
}

export function isValidHexColor(c) {
  const s = String(c || "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

function normalizeHex(hex) {
  const s = String(hex || "").trim();
  if (!isValidHexColor(s)) return null;
  if (s.length === 4) {
    // #RGB -> #RRGGBB
    return (
      "#" +
      s[1] + s[1] +
      s[2] + s[2] +
      s[3] + s[3]
    ).toLowerCase();
  }
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function relLuminance({ r, g, b }) {
  // WCAG relative luminance
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function shouldUseLightText(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const L = relLuminance(rgb);
  // compare contrast against white vs near-black
  const contrastWhite = (1.05) / (L + 0.05);
  const contrastBlack = (L + 0.05) / (0.05);
  return contrastWhite >= contrastBlack;
}

function getJobStateRing(job, warnings) {
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;

  const overrideActive =
    !!job?.startPoint &&
    (job?.allowStartOverride ?? job?.overrideStart ?? false);

  if (isJobCompleted(job)) return "ring-2 ring-green-500/30";
  if (hasWarnings) return "ring-2 ring-amber-500/35";
  if (overrideActive) return "ring-2 ring-red-500/35";
  return "";
}


function getJobBgClass(job, warnings) {
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;

  const overrideActive =
    !!job?.startPoint &&
    (job?.allowStartOverride ?? job?.overrideStart ?? false);

  if (isJobCompleted(job)) {
    return "bg-green-50 border-green-300";
  }
  if (hasWarnings) {
    return "bg-amber-50 border-amber-300";
  }
  if (overrideActive) {
    return "bg-white border-red-300";
  }
  return "bg-white border-gray-200";
}

const JobCard = ({
  job,
  segment,
  resources,
  onUpdate,
  onDelete,
  onOpen,
  onDuplicate,
  isAdmin,
  variant = "compact",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(() => ({
    ...job,
    // دعم بيانات قديمة عندها overrideStart بس
    allowStartOverride: job.allowStartOverride ?? job.overrideStart ?? false,
  }));
  const { isOver, setNodeRef } = useDroppable({ id: job.id });

  const getDriver = (id) =>
    (resources.drivers || []).find((d) => String(d.id) === String(id));
  const getTractor = (id) =>
    (resources.tractors || []).find((t) => String(t.id) === String(id));
  const getTrailer = (id) =>
    (resources.trailers || []).find((t) => String(t.id) === String(id));

  const warnings = getJobWarnings(job, resources);
  const hasWarnings = warnings.length > 0;

  const isDayList = variant === "day-list";

  const routeStart =
    (job?.allowStartOverride && (job?.startPoint || job?.pickup))
      ? job.startPoint || job.pickup
      : job?.pickup || job?.startPoint || "";
  const routeEnd = job?.dropoff || job?.endPoint || "";

  const tractor = job?.tractorId ? getTractor(job.tractorId) : null;
  const trailer = job?.trailerId ? getTrailer(job.trailerId) : null;

  // UI labels (safe): prefer code, then plate, else short id.
  const tractorLabel = tractor
    ? tractor.code || tractor.plate || String(tractor.id || "").slice(0, 8)
    : "";
  const trailerLabel = trailer
    ? trailer.code || trailer.plate || String(trailer.id || "").slice(0, 8)
    : "";
  const driverNames = Array.isArray(job?.driverIds)
    ? job.driverIds
        .map((id) => getDriver(id))
        .filter(Boolean)
        .map((d) => d.name)
    : [];

  const saveInline = () => {
    if (!onUpdate) {
      setIsEditing(false);
      return;
    }
    const payload = {
      ...editData,
      // نخلي الاتنين متزامنين علشان أي كود قديم
      overrideStart: editData.allowStartOverride,
    };
    onUpdate(job.id, payload);
    setIsEditing(false);
  };

  const cancelInline = () => {
    setEditData({
      ...job,
      allowStartOverride: job.allowStartOverride ?? job.overrideStart ?? false,
    });
    setIsEditing(false);
  };

  const bgClass = getJobBgClass(job, warnings);
  const accentColor = isValidHexColor(job?.color) ? job.color : null;

  /* =========== EDIT MODE =========== */
  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        className={`bg-white border-2 rounded-lg p-3 shadow-lg ${
          isOver
            ? "bg-blue-50 border-blue-300 border-dashed"
            : "border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-blue-700 text-sm">Edit Job</h4>
          <div className="flex gap-2">
            <button
              onClick={saveInline}
              className="text-green-600 hover:text-green-800 p-1 text-sm"
            >
              ✓
            </button>
            <button
              onClick={cancelInline}
              className="text-red-600 hover:text-red-800 p-1 text-sm"
            >
              ✗
            </button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <input
            value={editData.client || ""}
            onChange={(e) =>
              setEditData((p) => ({ ...p, client: e.target.value }))
            }
            className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Client"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              type="text"
              value={editData.startPoint || ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, startPoint: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Start point"
            />
            <input
              type="text"
              value={editData.endPoint || ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, endPoint: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="End point"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={!!editData.allowStartOverride}
              onChange={(e) =>
                setEditData((p) => ({
                  ...p,
                  allowStartOverride: e.target.checked,
                }))
              }
            />
            Override start point manually
          </label>

          <div className="grid grid-cols-2 gap-1">
            <input
              type="time"
              value={editData.start || ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, start: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              value={editData.durationHours ?? ""}
              onChange={(e) =>
                setEditData((p) => ({
                  ...p,
                  durationHours: parseFloat(e.target.value) || 0,
                }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Hours"
              step="0.5"
              min="0"
            />
          </div>
        </div>
      </div>
    );
  }

  /* =========== VIEW MODE =========== */
  const statusKey = computeJobStatus(job);
  const statusColor = STATUS_COLORS[statusKey] || STATUS_COLORS.incomplete;


  const displayTimeRange = (() => {
    if (!segment) return null;
    const s = segment.displayStart || job.start || "--:--";
    const e = segment.displayEnd || "--:--";
    return `${s} → ${e}`;
  })();

  const displaySegmentHours = (() => {
    if (!segment) return null;
    const mins = Math.max(0, (segment.endMinutes || 0) - (segment.startMinutes || 0));
    const h = mins / 60;
    const s = String(h.toFixed(1)).replace(/\.0$/, "");
    return `${s}h`;
  })();

  const pickupLabel = job.startPoint || job.pickup || "Start?";
  const dropoffLabel = job.endPoint || job.dropoff || "End?";
  const shortKey = jobShortKey(job.id);

  const useAccentBg = !!accentColor && !isOver;
  const useLightText = useAccentBg ? shouldUseLightText(accentColor) : false;

  const tPrimary = useAccentBg
    ? useLightText
      ? "text-white"
      : "text-gray-900"
    : "text-gray-900";

  const tSecondary = useAccentBg
    ? useLightText
      ? "text-white/90"
      : "text-gray-700"
    : "text-gray-600";

  const tMuted = useAccentBg
    ? useLightText
      ? "text-white/75"
      : "text-gray-600"
    : "text-gray-600";

  const codeBadgeClass = useAccentBg
    ? useLightText
      ? "bg-white/20 text-white border border-white/30"
      : "bg-white/70 text-gray-900 border border-black/10"
    : "bg-indigo-50 text-indigo-800 border border-indigo-200";

  const idBadgeClass = useAccentBg
    ? useLightText
      ? "bg-white/15 text-white border border-white/25"
      : "bg-white/60 text-gray-800 border border-black/10"
    : "bg-gray-100 text-gray-700 border border-gray-200";

  const chipClass = useAccentBg
    ? useLightText
      ? "bg-white/15 text-white"
      : "bg-white/70 text-gray-900"
    : "bg-gray-100 text-gray-800";

  const actionBtnBase = useAccentBg
    ? useLightText
      ? "p-1 text-white/85 hover:text-white rounded hover:bg-white/15"
      : "p-1 text-gray-700 hover:text-gray-900 rounded hover:bg-black/5"
    : null;

  return (
    <div
      onClick={() => onOpen && onOpen()}
      ref={setNodeRef}
      style={
        useAccentBg
          ? {
              backgroundColor: accentColor,
              borderColor: useLightText
                ? "rgba(255,255,255,0.35)"
                : "rgba(0,0,0,0.12)",
            }
          : undefined
      }
      className={`relative border ${useAccentBg ? getJobStateRing(job, warnings) : bgClass} rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer ${
        isDayList ? "p-4 text-sm sm:text-sm min-h-[96px]" : "p-3 text-xs sm:text-[13px] min-h-[60px]"
      } ${isOver ? "bg-blue-50 border-2 border-blue-300 border-dashed" : ""}`}
    >
      {/* status dot */}
      <span
        className={`absolute top-2 left-2 w-2 h-2 rounded-full ${statusColor} ${
          useAccentBg ? (useLightText ? "ring-2 ring-white/60" : "ring-2 ring-black/20") : ""
        }`}
      />

{/* Header: Client + actions */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0 pl-3">
          <h4
            className={`font-semibold ${tPrimary} ${isDayList ? "text-base" : "text-sm"}`}
            title={`${job.client || "New Client"}${shortKey ? ` (#${shortKey})` : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{job.client || "New Client"}</span>
              {job?.client ? (
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${codeBadgeClass}`}>
                  {job.client}
                </span>
              ) : null}
              {shortKey ? (
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${idBadgeClass}`}>
                  #{shortKey}
                </span>
              ) : null}
            </div>
          </h4>
          <div className={`mt-[2px] flex items-center gap-1 text-[11px] ${tSecondary}`}>
            <Clock size={12} />
            <span>{displayTimeRange || (job.start || "--:--")}</span>
            {job.durationHours ? (
              <>
                <span>•</span>
                <span>{displaySegmentHours || `${job.durationHours}h`}</span>
              </>
            ) : null}
          </div>
          {segment?.isMultiDay ? (
            <div className={`mt-1 text-[10px] ${useAccentBg ? (useLightText ? "text-white/90" : "text-gray-800") : "text-purple-700"} pl-3`}>
              {segment.startsPrevDay ? `↩ Started ${segment.originalStartISO} ${segment.originalStartTime}` : null}
              {segment.startsPrevDay && segment.endsNextDay ? " • " : null}
              {segment.endsNextDay ? `↪ Ends ${segment.originalEndISO} ${segment.originalEndTime}` : null}
            </div>
          ) : null}

          {isDayList ? (
            <div className="mt-2 space-y-1 pl-3">
              {(pickupLabel || dropoffLabel) ? (
                <div className={`flex items-center gap-1 text-[12px] ${useAccentBg ? tSecondary : "text-gray-700"} min-w-0`}>
                  <MapPin size={12} />
                  <span className="truncate">
                    {pickupLabel || "—"} {dropoffLabel ? "→" : ""} {dropoffLabel || ""}
                  </span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1">
                {tractorLabel ? (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${chipClass}`}>🚚 {tractorLabel}</span>
                ) : null}
                {trailerLabel ? (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${chipClass}`}>🛞 {trailerLabel}</span>
                ) : null}
                {driverNames?.length ? (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${chipClass}`}>👤 {driverNames.join(", ")}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate && onDuplicate(job.id);
              }}
              className={actionBtnBase || "p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"}
              title="Duplicate job"
            >
              <Copy size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className={actionBtnBase || "p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"}
              title="Edit job"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Delete this job?")) {
                  onDelete && onDelete(job.id);
                }
              }}
              className={actionBtnBase || "p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"}
              title="Delete job"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* هنا لو حبيت ترجع الـ route / badges / pricing تاني، الكود موجود ومتعَلَّق فوق */}

      {/* Warnings (لسه متعطلة بالـ hidden لو حبيت تفعّلها بعدين) */}
      {/* {warnings.length > 0 && (
        <div className={`mt-2 pt-2 border-t ${useAccentBg ? (useLightText ? "border-white/20" : "border-black/10") : "border-amber-100"} pr-16 hidden`}>
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-center gap-1 text-[11px] ${useAccentBg ? (useLightText ? "text-white/90" : "text-amber-800") : "text-amber-700"} mb-[2px]`}
            >
              <AlertTriangle size={11} />
              <span className="truncate">{w}</span>
            </div>
          ))}
        </div>
      )} */}
    </div>
  );
};

export default JobCard;
