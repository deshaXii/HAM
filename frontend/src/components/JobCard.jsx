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
} from "lucide-react";

const STATUS_COLORS = {
  incomplete: "bg-gray-400",
  waiting: "bg-yellow-400",
  processed_soon: "bg-orange-500",
  processed: "bg-blue-500",
  complete: "bg-green-600",
};

function computeJobStatus(job) {
  // missing essentials?
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

const JobCard = ({ job, resources, onUpdate, onDelete, onOpen, isAdmin }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(job);
  const { isOver, setNodeRef } = useDroppable({ id: job.id });

  const getDriver = (id) => (resources.drivers || []).find((d) => d.id === id);
  const getTractor = (id) =>
    (resources.tractors || []).find((t) => t.id === id);
  const getTrailer = (id) =>
    (resources.trailers || []).find((t) => t.id === id);

  // تحذيرات
  const warnings = (() => {
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
    if (!job.driverIds || job.driverIds.length === 0)
      out.push("Missing driver");
    if (!job.durationHours || job.durationHours === 0)
      out.push("Missing duration");
    return out;
  })();

  const saveInline = () => {
    onUpdate && onUpdate(job.id, editData);
    setIsEditing(false);
  };
  const cancelInline = () => {
    setEditData(job);
    setIsEditing(false);
  };

  // UI helpers
  const cardBorder =
    job.overrideStart && job.startPoint ? "border-red-300" : "border-gray-200";

  // === EDIT MODE (مختصر) ===
  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        className={`bg-white border-2 ${cardBorder} rounded-lg p-3 shadow-lg ${
          isOver ? "bg-blue-50" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-blue-700">Edit Job</h4>
          <div className="flex gap-2">
            <button
              onClick={saveInline}
              className="text-green-600 hover:text-green-800 p-1"
            >
              ✓
            </button>
            <button
              onClick={cancelInline}
              className="text-red-600 hover:text-red-800 p-1"
            >
              ✗
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <input
            value={editData.client}
            onChange={(e) =>
              setEditData((p) => ({ ...p, client: e.target.value }))
            }
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Client"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              type="text"
              value={editData.startPoint || ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, startPoint: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Start point"
            />
            <input
              type="text"
              value={editData.endPoint || ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, endPoint: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              value={editData.start}
              onChange={(e) =>
                setEditData((p) => ({ ...p, start: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Hours"
              step="0.5"
              min="0"
            />
          </div>
        </div>
      </div>
    );
  }

  // === VIEW MODE ===
  return (
    <div
      onClick={() => onOpen && onOpen()}
      ref={setNodeRef}
      className={`bg-white border ${cardBorder} rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        isOver ? "bg-blue-50 border-2 border-blue-300 border-dashed" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate text-sm">
            {job.client}
          </h4>
          <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
            <Clock size={12} />
            <span>{job.start}</span>
            <span>•</span>
            <span>{job.durationHours}h</span>
          </div>
        </div>

        <div className="flex gap-1 ml-2">
          {isAdmin && (
            <>
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
                  if (window.confirm("Delete this job?"))
                    onDelete && onDelete(job.id);
                }}
                className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                title="Delete job"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Route */}
      <div className="flex items-center gap-1 text-xs text-gray-700 mb-3">
        <MapPin size={12} />
        <span className="truncate">{job.startPoint || "Start?"}</span>
        <span>→</span>
        <span className="truncate">{job.endPoint || "End?"}</span>
      </div>

      {/* Assigned Resources */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-blue-600 flex-shrink-0" />
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              job.tractorId
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {job.tractorId
              ? getTractor(job.tractorId)?.code
              : "Missing tractor"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-green-600 flex-shrink-0" />
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              job.trailerId
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {job.trailerId
              ? getTrailer(job.trailerId)?.code
              : "Missing trailer"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Users size={14} className="text-purple-600 flex-shrink-0" />
          <div className="flex flex-wrap gap-1">
            {job.driverIds && job.driverIds.length > 0 ? (
              job.driverIds.map((driverId) => {
                const driver = getDriver(driverId);
                return driver ? (
                  <span
                    key={driverId}
                    className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs"
                  >
                    {driver.name}
                  </span>
                ) : null;
              })
            ) : (
              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full text-xs">
                Missing driver
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pricing (هنسيبه مؤقتًا لحد ما تقول تمشي الحسابات ازاي) */}
      <div className="flex items-center gap-1 text-xs text-gray-700 mb-2 border-t pt-2">
        <Euro size={12} />
        <span>
          {job.pricing?.type === "fixed"
            ? `€${job.pricing?.value ?? 0}`
            : `€${job.pricing?.value ?? 0}/km`}
        </span>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border-t pt-2 mt-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-xs text-amber-700 mb-1"
            >
              <AlertTriangle size={12} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobCard;
