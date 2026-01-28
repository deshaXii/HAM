import React, { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import JobCard, { getJobWarnings } from "./JobCard";
import { getJobSegmentForDay, slotForMinutes } from "../lib/jobTime";

/**
 * Drop zone لبلوك وقت محدد في اليوم.
 * id بالشكل: time|2025-10-28|16-20
 */
function TimeSlotDropZone({ date, slotKey, children }) {
  const id = `time|${date}|${slotKey}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-transparent min-h-[80px] ${
        isOver ? "ring-2 ring-blue-400 ring-offset-1 bg-blue-50/40" : ""
      }`}
    >
      {children}
    </div>
  );
}

// السلوطات اللي بنعرضها في صفحة اليوم (من غير flex)
const TIME_SLOTS = [
  { key: "00-04", label: "00:00 - 04:00", startHour: 0, endHour: 4 },
  { key: "04-08", label: "04:00 - 08:00", startHour: 4, endHour: 8 },
  { key: "08-12", label: "08:00 - 12:00", startHour: 8, endHour: 12 },
  { key: "12-16", label: "12:00 - 16:00", startHour: 12, endHour: 16 },
  { key: "16-20", label: "16:00 - 20:00", startHour: 16, endHour: 20 },
  { key: "20-24", label: "20:00 - 24:00", startHour: 20, endHour: 24 },
];

function parseTimeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return h * 60 + (m || 0);
}

export default function DayTimelineView({
  date,
  state,
  isAdmin,
  filterTractor,
  filterTrailer,
  filterDriver,
  onAddJobSlot, // (dayISO, slotKey) => void
  onUpdateJob,
  onDeleteJob,
  onDuplicateJob,
  onOpenJob,
}) {
  const [viewFilter, setViewFilter] = useState("all");

  const TOTAL_MINUTES = 24 * 60;

  // 1) فلترة الشغلانات على اليوم + فلاتر resources
  // Include jobs that overlap this day (overnight / multi-day)
  let todaysJobs = (state.jobs || [])
    .map((job) => {
      const seg = getJobSegmentForDay(job, date);
      if (!seg) return null;
      return { job, seg };
    })
    .filter(Boolean);

  todaysJobs = todaysJobs.filter(({ job }) => {
    if (filterTractor && job.tractorId !== filterTractor) return false;
    if (filterTrailer && job.trailerId !== filterTrailer) return false;
    if (filterDriver && !(job.driverIds || []).includes(filterDriver))
      return false;
    return true;
  });

  const isUnscheduled = ({ job }) =>
    !job.start || !job.durationHours || job.durationHours <= 0;

  const hasWarnings = ({ job }) => getJobWarnings(job, state).length > 0;

  // 2) Quick filters
  let visibleJobs = todaysJobs;

  if (viewFilter === "conflicts") {
    visibleJobs = visibleJobs.filter((x) => hasWarnings(x));
  } else if (viewFilter === "unassigned") {
    visibleJobs = visibleJobs.filter((x) => isUnscheduled(x) || hasWarnings(x));
  } else if (viewFilter === "night") {
    visibleJobs = visibleJobs.filter((x) => slotForMinutes(x.seg.startMinutes) === "night");
  }

  const unscheduledItems = visibleJobs.filter((x) => isUnscheduled(x));
  const scheduledItemsRaw = visibleJobs.filter((x) => !isUnscheduled(x));

  const humanDateLabel = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function slotKeyForMinutes(mins) {
    const m = Math.max(0, Math.min(TOTAL_MINUTES - 1, mins || 0));
    const h = Math.floor(m / 60);
    const slot = TIME_SLOTS.find((s) => h >= s.startHour && h < s.endHour);
    return slot?.key || TIME_SLOTS[0].key;
  }

  // 3) Prepare scheduled items (UI only)
  const scheduledItems = useMemo(() => {
    return scheduledItemsRaw
      .map(({ job, seg }) => {
        const startMinutes = Math.max(0, Math.min(TOTAL_MINUTES, seg?.startMinutes ?? 0));
        const endMinutes = Math.max(0, Math.min(TOTAL_MINUTES, seg?.endMinutes ?? startMinutes));
        return {
          job,
          seg,
          startMinutes,
          endMinutes,
          slotKey: slotKeyForMinutes(startMinutes),
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [scheduledItemsRaw, date]);

  const slotRows = useMemo(() => {
    const grouped = new Map(TIME_SLOTS.map((s) => [s.key, []]));
    for (const it of scheduledItems) {
      if (!grouped.has(it.slotKey)) grouped.set(it.slotKey, []);
      grouped.get(it.slotKey).push(it);
    }
    // Keep start-time order inside each slot
    for (const [k, arr] of grouped) {
      arr.sort((a, b) => a.startMinutes - b.startMinutes);
      grouped.set(k, arr);
    }
    return TIME_SLOTS.map((slot) => ({ slot, items: grouped.get(slot.key) || [] }));
  }, [scheduledItems]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Day Planning</h2>
          <p className="text-xs text-gray-500 mt-1">
            Showing {visibleJobs.length} of {todaysJobs.length} jobs
          </p>
        </div>
        <div className="text-sm text-gray-600">{humanDateLabel}</div>
      </div>

      {/* Quick filters */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All jobs" },
            { id: "conflicts", label: "Conflicts" },
            { id: "unassigned", label: "Unassigned / No-time" },
            { id: "night", label: "Night jobs" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setViewFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                viewFilter === f.id
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unassigned / No-time lane */}
      {unscheduledItems.length > 0 && (
        <div className="mb-5 rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">
              Unassigned / no-time jobs
            </span>
            <span className="text-[11px] text-gray-500">
              {unscheduledItems.length} job
              {unscheduledItems.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {unscheduledItems.map(({ job, seg }) => (
              <div
                key={job.id}
                className="w-full sm:w-[260px] lg:w-[280px] max-w-full"
              >
                <JobCard
                  job={job}
                  segment={seg}
                  resources={state}
                  isAdmin={isAdmin}
                  onOpen={() => onOpenJob(job.id)}
                  onDelete={(jobId) => onDeleteJob(jobId)}
                  onUpdate={(jobId, data) => onUpdateJob(jobId, data)}
                  onDuplicate={(jobId) =>
                    onDuplicateJob && onDuplicateJob(jobId)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day slots (time on the left, jobs stacked full-width on the right) */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          {slotRows.map(({ slot, items }, idx) => (
            <div
              key={slot.key}
              className={`grid grid-cols-[140px_1fr] gap-0 ${
                idx === 0 ? "" : "border-t border-gray-200"
              }`}
            >
              <div className="bg-gray-50 px-3 py-3 text-xs flex items-center justify-between">
                <div className="font-medium text-gray-700">{slot.label}</div>
                {isAdmin && (
                  <button
                    onClick={() => onAddJobSlot(date, slot.key)}
                    className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-700"
                    title="Add job in this time slot"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              <div className="bg-white px-3 py-3">
                <TimeSlotDropZone date={date} slotKey={slot.key}>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <div className="text-[11px] text-gray-400 px-2 py-4">
                        No jobs in this slot
                      </div>
                    ) : (
                      items.map((it) => (
                        <div key={it.job.id} className="w-full">
                          <JobCard
                            job={it.job}
                            segment={it.seg}
                            resources={state}
                            isAdmin={isAdmin}
                            variant="day-list"
                            onOpen={() => onOpenJob(it.job.id)}
                            onDelete={(jobId) => onDeleteJob(jobId)}
                            onUpdate={(jobId, data) => onUpdateJob(jobId, data)}
                            onDuplicate={(jobId) =>
                              onDuplicateJob && onDuplicateJob(jobId)
                            }
                          />
                        </div>
                      ))
                    )}
                  </div>
                </TimeSlotDropZone>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
