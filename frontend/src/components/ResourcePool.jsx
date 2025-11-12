import React from "react";
import { useDraggable } from "@dnd-kit/core";

// يرجّع كل الـ jobs اللي فيها المورد ده
function getAssignedJobsForResource(jobs, type, resourceId) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  if (type === "driver") {
    return safeJobs.filter(
      (job) =>
        Array.isArray(job.driverIds) && job.driverIds.includes(resourceId)
    );
  }
  if (type === "tractor") {
    return safeJobs.filter((job) => job.tractorId === resourceId);
  }
  if (type === "trailer") {
    return safeJobs.filter((job) => job.trailerId === resourceId);
  }
  return [];
}

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

// نحول أي قيمة لتاريخ ISO قصير "yyyy-mm-dd"
function toShortIso(x) {
  if (!x) return "";
  if (typeof x === "string") {
    return x.slice(0, 10);
  }
  try {
    return new Date(x).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// هل السائق مقفول في تاريخ معيّن
function isDriverLockedOnDate(driver, lockDateISO) {
  if (!driver || !lockDateISO) return false;
  const dayIso = toShortIso(lockDateISO);

  const weekAvailability = Array.isArray(driver.weekAvailability)
    ? driver.weekAvailability
    : [1, 2, 3, 4, 5]; // Mon-Fri لو مش موجود أصلاً

  const weekday = new Date(dayIso).getDay(); // 0..6
  const canWorkThatDay = weekAvailability.includes(weekday);

  // الإجازات
  const leavesArr = Array.isArray(driver.leaves)
    ? driver.leaves
    : typeof driver.leaves === "string" && driver.leaves.trim()
    ? driver.leaves.split(",").map((s) => s.trim())
    : [];

  const normalizedLeaves = leavesArr.map((d) => toShortIso(d));
  const onLeave = normalizedLeaves.includes(dayIso);

  return !canWorkThatDay || onLeave;
}

function DraggableResource({ resource, type, jobs, lockDateISO }) {
  const draggableId = `resource-${type}-${resource.id}`;
  const isDriver = type === "driver";

  const driverNoDays =
    isDriver &&
    Array.isArray(resource.weekAvailability) &&
    resource.weekAvailability.length === 0;

  const driverLocked = isDriver
    ? isDriverLockedOnDate(resource, lockDateISO)
    : false;
  const disabledDrag = driverNoDays || driverLocked;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: draggableId,
      data: { kind: "resource", resourceType: type, resourceId: resource.id },
      disabled: disabledDrag,
    });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : disabledDrag ? 0.6 : 1,
  };

  const assignedJobs = getAssignedJobsForResource(jobs, type, resource.id);
  const jobCount = assignedJobs.length;

  let mainLabel =
    type === "driver"
      ? resource.name || "Unnamed Driver"
      : resource.code || "No Code";

  let subLabel = "";
  if (type === "tractor") {
    subLabel = resource.plate || resource.currentLocation || "";
  } else if (type === "trailer") {
    subLabel = resource.plate || resource.type || "";
  } else if (type === "driver") {
    const flags = [];
    if (resource.canNight) flags.push("Night");
    if (resource.sleepsInCab) flags.push("Sleeps in cab");
    if (resource.doubleMannedEligible) flags.push("2-man OK");
    subLabel = flags.join(" • ");
  }

  const rating = Number.isFinite(Number(resource?.rating))
    ? Number(resource.rating)
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!disabledDrag ? listeners : {})}
      {...(!disabledDrag ? attributes : {})}
      className={`relative border rounded-lg p-3 bg-white transition-colors shadow-sm ${
        disabledDrag
          ? "cursor-not-allowed bg-slate-100"
          : "cursor-grab hover:bg-gray-50 active:cursor-grabbing"
      } ${isDragging ? "ring-2 ring-blue-400" : ""}`}
    >
      {isDriver && driverNoDays && (
        <div className="absolute top-1 right-1 bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-[9px]">
          لا يعمل هذا الأسبوع
        </div>
      )}
      {isDriver && lockDateISO && driverLocked && !driverNoDays && (
        <div
          className="absolute top-1 right-1 bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center text-[11px]"
          title="Driver unavailable on this day"
        >
          !
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {isDriver ? (
              resource.photoUrl ? (
                <img
                  src={resource.photoUrl}
                  alt={resource.name || "driver"}
                  className="h-8 w-8 rounded-full object-cover border border-gray-200 flex-shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                  {initialsOf(resource.name)}
                </div>
              )
            ) : null}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">
                {mainLabel}
              </div>
              {subLabel ? (
                <div className="text-[11px] text-gray-500 truncate">
                  {subLabel}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* RIGHT BADGES */}
        <div className="flex flex-col items-end gap-1">
          {isDriver ? (
            <span
              className="inline-flex items-center justify-center text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap"
              title="Driver rating"
            >
              ★ {rating.toFixed(1)}
            </span>
          ) : null}

          {jobCount > 0 ? (
            <span className="inline-flex items-center justify-center text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium whitespace-nowrap">
              {jobCount} job{jobCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="inline-flex items-center justify-center text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap">
              free
            </span>
          )}
        </div>
      </div>

      {isDriver && driverNoDays ? (
        <div className="text-[10px] text-red-500 mt-1">
          هذا السائق غير متاح في أي يوم
        </div>
      ) : null}
    </div>
  );
}

export default function ResourcePool({
  title,
  icon: Icon,
  resources,
  type,
  jobs,
  lockDateISO,
}) {
  const safeResources = Array.isArray(resources) ? resources : [];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 rounded-lg text-gray-700">
            <Icon size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800">{title}</div>
            <div className="text-[11px] text-gray-500 leading-tight">
              {safeResources.length} total
            </div>
          </div>
        </div>
      </div>

      {safeResources.length === 0 ? (
        <div className="text-xs text-gray-400 italic text-center py-6">
          (empty)
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 tiny-scrollbar">
          {safeResources.map((res) => (
            <DraggableResource
              key={res.id}
              resource={res}
              type={type}
              jobs={jobs}
              lockDateISO={lockDateISO}
            />
          ))}
        </div>
      )}
    </div>
  );
}
