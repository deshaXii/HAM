import React, { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { labelsFor } from "../constants/trailerTaxonomy";
import { resolveDriverPhotoUrl } from "../lib/photoUrl";

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

// ISO قصير yyyy-mm-dd
function toShortIso(x) {
  if (!x) return "";
  if (typeof x === "string") return x.slice(0, 10);
  try {
    return new Date(x).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/* ---------- normalize weekAvailability (يدعم أرقام وأسماء أيام وأوبجكت) ---------- */
const DAY_NAME_TO_NUM = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function normalizeWeekAvailability(wa) {
  if (wa === null || wa === undefined) return null; // null ⇒ كل الأيام متاحة
  if (Array.isArray(wa)) {
    return wa
      .map((v) => {
        if (typeof v === "number") return v;
        const s = String(v).toLowerCase();
        if (DAY_NAME_TO_NUM.hasOwnProperty(s)) return DAY_NAME_TO_NUM[s];
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter((x) => x !== null);
  }
  if (typeof wa === "object") {
    return Object.keys(wa)
      .filter((k) => !!wa[k])
      .map((k) => {
        const s = String(k).toLowerCase();
        if (DAY_NAME_TO_NUM.hasOwnProperty(s)) return DAY_NAME_TO_NUM[s];
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter((x) => x !== null);
  }
  return null;
}

function isDriverLockedOnDate(driver, lockDateISO) {
  if (!driver || !lockDateISO) return false;

  const dayIso = toShortIso(lockDateISO);
  const weekday = new Date(dayIso).getDay(); // 0..6

  const list = normalizeWeekAvailability(driver.weekAvailability);
  const canWorkThatDay =
    list === null ? true : Array.isArray(list) && list.includes(weekday);

  const leavesArr = Array.isArray(driver.leaves)
    ? driver.leaves
    : typeof driver.leaves === "string" && driver.leaves.trim()
    ? driver.leaves.split(",").map((s) => s.trim())
    : [];

  const onLeave = leavesArr.map((d) => toShortIso(d)).includes(dayIso);

  return !canWorkThatDay || onLeave;
}

/* -------------------------------------------------------------------------------- */

function DraggableResource({
  resource,
  type,
  jobs,
  lockMode = "none",
  lockDateISO,
}) {
  const draggableId = `resource-${type}-${resource.id}`;
  const isDriver = type === "driver";

  // لا يعمل أي يوم لو الليست فاضية صراحة
  const normAvail = normalizeWeekAvailability(resource.weekAvailability);
  const driverNoDays =
    isDriver && Array.isArray(normAvail) && normAvail.length === 0;

  // 🔒 الإقفال بالـتاريخ يُفعّل فقط في وضع اليوم
  const shouldLockByDate = lockMode === "day" && !!lockDateISO;
  const driverLocked =
    isDriver && shouldLockByDate
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

  // ✅ عرض الـ Plate أولاً ثم الـ Code (مفيد جداً مع الداتا الكبيرة)
  let mainLabel =
    type === "driver"
      ? resource.name || "Unnamed Driver"
      : resource.plate || resource.code || "No Plate";

  let subLabel = "";
  if (type === "tractor") {
    const parts = [];
    if (resource.plate && resource.code) parts.push(resource.code);
    if (resource.currentLocation) parts.push(resource.currentLocation);
    subLabel = parts.join(" • ");
  } else if (type === "trailer") {
    const labels = labelsFor(
      Array.isArray(resource.types)
        ? resource.types
        : resource.type
        ? [resource.type]
        : []
    );
    const parts = [];
    if (resource.plate && resource.code) parts.push(resource.code);
    if (resource.currentLocation) parts.push(resource.currentLocation);
    if (labels.length) parts.push(labels.join(", "));
    subLabel = parts.filter(Boolean).join(" • ");
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
      {/* يظهر الشيب فقط في وضع اليوم */}
      {isDriver && shouldLockByDate && driverLocked && !driverNoDays && (
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
                  src={resolveDriverPhotoUrl(resource.photoUrl)}
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

        <div className="flex flex-col items-end gap-1">
          {isDriver && (
            <span
              className="inline-flex items-center justify-center text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap"
              title="Driver rating"
            >
              ★ {rating.toFixed(1)}
            </span>
          )}

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
  lockMode = "none", // "none" | "day"
  lockDateISO, // يُستخدم فقط مع lockMode="day"
}) {
  const safeResources = Array.isArray(resources) ? resources : [];

  // 🔎 per-section search (مهم جداً مع وجود 100+ عنصر)
  const [q, setQ] = useState("");

  const filteredResources = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return safeResources;

    if (type === "driver") {
      return safeResources.filter(
        (d) =>
          (d.name || "").toLowerCase().includes(qq) ||
          (d.code || "").toLowerCase().includes(qq)
      );
    }

    // tractor / trailer
    return safeResources.filter(
      (t) =>
        (t.plate || "").toLowerCase().includes(qq) ||
        (t.code || "").toLowerCase().includes(qq)
    );
  }, [safeResources, q, type]);

  const countLabel =
    filteredResources.length === safeResources.length
      ? `${safeResources.length} total`
      : `${filteredResources.length} / ${safeResources.length}`;

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
              {countLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            type === "driver" ? "Search name / code..." : "Search plate / code..."
          }
          className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear"
          >
            ✕
          </button>
        ) : null}
      </div>

      {filteredResources.length === 0 ? (
        <div className="text-xs text-gray-400 italic text-center py-6">
          (no results)
        </div>
      ) : (
        <div className="space-y-2 h-[520px] overflow-y-auto pr-1 tiny-scrollbar">
          {filteredResources.map((res) => (
            <DraggableResource
              key={res.id}
              resource={res}
              type={type}
              jobs={jobs}
              lockMode={lockMode}
              lockDateISO={lockDateISO}
            />
          ))}
        </div>
      )}
    </div>
  );
}
