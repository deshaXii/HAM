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

  const getDriver = (id) => drivers.find((d) => d.id === id);
  const getTractor = (id) => tractors.find((t) => t.id === id);
  const getTrailer = (id) => trailers.find((t) => t.id === id);

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

  // لو مفيش start/time
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

export function getJobBgClass(job, warnings) {
  if (isJobCompleted(job)) {
    // أخضر فاتح
    return "bg-green-50 border-green-300";
  }
  if (warnings && warnings.length > 0) {
    // أصفر فاتح للناقص
    return "bg-yellow-50 border-yellow-300";
  }
  // أبيض للـ OK
  return "bg-white border-gray-200";
}
const JobCard = ({
  job,
  resources,
  onUpdate,
  onDelete,
  onOpen,
  onDuplicate,
  isAdmin,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(job);
  const { isOver, setNodeRef } = useDroppable({ id: job.id });

  const getDriver = (id) => (resources.drivers || []).find((d) => d.id === id);
  const getTractor = (id) =>
    (resources.tractors || []).find((t) => t.id === id);
  const getTrailer = (id) =>
    (resources.trailers || []).find((t) => t.id === id);

  const warnings = getJobWarnings(job, resources);
  const hasWarnings = warnings.length > 0;

  const saveInline = () => {
    onUpdate && onUpdate(job.id, editData);
    setIsEditing(false);
  };
  const cancelInline = () => {
    setEditData(job);
    setIsEditing(false);
  };
  const bgClass = getJobBgClass(job, warnings);

  let cardBorder = "border-gray-200";
  if (job.overrideStart && job.startPoint) cardBorder = "border-red-300";
  if (hasWarnings) cardBorder = "border-amber-400";

  /* =========== EDIT MODE =========== */
  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        className={`bg-white border-2 ${cardBorder} rounded-lg p-3 shadow-lg ${
          isOver ? "bg-blue-50" : ""
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
            value={editData.client}
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
              checked={!!editData.overrideStart}
              onChange={(e) =>
                setEditData((p) => ({ ...p, overrideStart: e.target.checked }))
              }
            />
            Allow manual Start point override
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
              value={editData.durationHours}
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

  const pickupLabel = job.startPoint || job.pickup || "Start?";
  const dropoffLabel = job.endPoint || job.dropoff || "End?";

  return (
    <div
      onClick={() => onOpen && onOpen()}
      ref={setNodeRef}
      //  pb-6
      className={`relative border ${cardBorder}  ${bgClass} rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer text-xs sm:text-[13px] min-h-[60px] ${
        hasWarnings ? "bg-amber-50" : "bg-white"
      } ${isOver ? "bg-blue-50 border-2 border-blue-300 border-dashed" : ""}`}
    >
      {/* status dot */}
      <span
        className={`absolute top-2 left-2 w-2 h-2 rounded-full ${statusColor}`}
      />

      {/* Header: Client + actions */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0 pl-3">
          <h4 className="font-semibold text-gray-900 truncate text-sm">
            {job.client || "New Client"}
          </h4>
          <div className="mt-[2px] flex items-center gap-1 text-[11px] text-gray-600">
            <Clock size={12} />
            <span>{job.start || "--:--"}</span>
            {job.durationHours ? (
              <>
                <span>•</span>
                <span>{job.durationHours}h</span>
              </>
            ) : null}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate && onDuplicate(job.id);
              }}
              className="p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
              title="Duplicate job"
            >
              <Copy size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
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
              className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
              title="Delete job"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Route line */}
      {/*  mb-2 */}
      {/* <div className="flex items-center gap-1 text-[11px] text-gray-700 pl-3">
        <MapPin size={12} />
        <span className="truncate">
          {pickupLabel} → {dropoffLabel}
        </span>
      </div> */}

      {/* Badges: Tractor + Trailer + Drivers جنب بعض */}
      {/* <div className="flex flex-wrap items-center gap-1 pl-3 pr-8 mb-1"> */}
      {/* Tractor */}
      {/* <span
          className={`inline-flex items-center gap-[4px] px-2 py-[3px] rounded-full text-[11px] ${
            job.tractorId
              ? "bg-blue-100 text-blue-800"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          <Truck size={12} className="shrink-0" />
          <span>
            {job.tractorId
              ? getTractor(job.tractorId)?.code || "Tractor"
              : "No tractor"}
          </span>
        </span> */}

      {/* Trailer */}
      {/* <span
          className={`inline-flex items-center gap-[4px] px-2 py-[3px] rounded-full text-[11px] ${
            job.trailerId
              ? "bg-emerald-100 text-emerald-800"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          <MapPin size={12} className="shrink-0" />
          <span>
            {job.trailerId
              ? getTrailer(job.trailerId)?.code || "Trailer"
              : "No trailer"}
          </span>
        </span> */}

      {/* Drivers */}
      {/* {job.driverIds && job.driverIds.length > 0 ? (
          job.driverIds.map((driverId) => {
            const driver = getDriver(driverId);
            if (!driver) return null;
            return (
              <span
                key={driverId}
                className="inline-flex items-center gap-[4px] px-2 py-[3px] rounded-full bg-purple-100 text-purple-800 text-[11px]"
              >
                <Users size={12} className="shrink-0" />
                <span>{driver.name}</span>
              </span>
            );
          })
        ) : (
          <span className="inline-flex items-center gap-[4px] px-2 py-[3px] rounded-full bg-gray-100 text-gray-500 text-[11px]">
            <Users size={12} className="shrink-0" />
            <span>No driver</span>
          </span>
        )} */}
      {/* </div> */}

      {/* Pricing absolute في الركن تحت يمين */}
      {/* <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[11px] text-gray-700">
        <Euro size={12} />
        <span>
          {job.pricing?.type === "fixed"
            ? `€${job.pricing?.value ?? 0}`
            : `€${job.pricing?.value ?? 0}/km`}
        </span>
      </div> */}

      {/* Warnings لو موجودة (تحت على الشمال) */}
      {warnings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-100 pr-16 hidden">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-[11px] text-amber-700 mb-[2px]"
            >
              <AlertTriangle size={11} />
              <span className="truncate">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobCard;
