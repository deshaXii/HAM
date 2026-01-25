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
  const MIN_WIDTH_PCT = 7;
  const LANE_HEIGHT = 10;
  const LANE_GAP = 70;
  const MIN_TIMELINE_HEIGHT = 960;

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

  const unscheduledJobs = visibleJobs.filter((job) => isUnscheduled(job));
  const scheduledJobs = visibleJobs.filter((x) => !isUnscheduled(x));

  const humanDateLabel = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 3) meta للي عندهم وقت بس
  const jobsWithMeta = useMemo(() => {
    const items = scheduledJobs
      .map(({ job, seg }) => {
                const startMinutes = Math.min(seg.startMinutes || 0, TOTAL_MINUTES);
                let endMinutes = Math.min(seg.endMinutes || startMinutes + 60, TOTAL_MINUTES);
        let durationMinutes = Math.max(1, endMinutes - startMinutes);

        let widthPct = ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100;
        if (widthPct < MIN_WIDTH_PCT) widthPct = MIN_WIDTH_PCT;

        const leftPct = (startMinutes / TOTAL_MINUTES) * 100;

        return {
          job,
          seg,
          startMinutes,
          endMinutes,
          leftPct,
          widthPct,
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const lanesLastEnd = [];
    items.forEach((item) => {
      let laneIndex = 0;

      for (; laneIndex < lanesLastEnd.length; laneIndex++) {
        if (item.startMinutes >= (lanesLastEnd[laneIndex] || 0)) {
          break;
        }
      }
      lanesLastEnd[laneIndex] = item.endMinutes;
      item.lane = laneIndex;
    });

    const laneCount = lanesLastEnd.length || 1;
    const computedHeight = laneCount * LANE_HEIGHT + (laneCount - 1) * LANE_GAP;
    const timelineHeight = Math.max(MIN_TIMELINE_HEIGHT, computedHeight);

    return { items, laneCount, timelineHeight };
  }, [scheduledJobs]);

  const { items: metaItems, timelineHeight } = jobsWithMeta;

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
      {unscheduledJobs.length > 0 && (
        <div className="mb-5 rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">
              Unassigned / no-time jobs
            </span>
            <span className="text-[11px] text-gray-500">
              {unscheduledJobs.length} job
              {unscheduledJobs.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {unscheduledJobs.map((job) => (
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

      {/* Slot headers (00-04, 04-08, ...) */}
      <div className="grid grid-cols-6 gap-0 mb-3 sticky top-[15px] z-50">
        {TIME_SLOTS.map((slot, idx) => (
          <div
            key={slot.key}
            className={`flex items-center justify-between px-3 py-2 text-xs bg-gray-50 border border-gray-200 border-r-0 last:border-r ${
              idx === 0
                ? "rounded-l-lg"
                : idx === TIME_SLOTS.length - 1
                ? "rounded-r-lg"
                : ""
            }`}
          >
            <span className="font-medium text-gray-700">{slot.label}</span>
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
        ))}
      </div>

      {/* Timeline body */}
      <div className="relative">
        {/* خلفية الأعمدة + drop zones */}
        <div className="absolute inset-0 grid grid-cols-6 gap-0">
          {TIME_SLOTS.map((slot, idx) => (
            <div
              key={slot.key}
              className={`relative bg-gray-50 border border-gray-200 border-t-0 border-r-0 last:border-r ${
                idx === 0
                  ? "rounded-bl-lg"
                  : idx === TIME_SLOTS.length - 1
                  ? "rounded-br-lg"
                  : ""
              }`}
            >
              <div className="absolute inset-0 px-2 pt-3 pb-4">
                <TimeSlotDropZone date={date} slotKey={slot.key}>
                  <div style={{ height: timelineHeight }} />
                </TimeSlotDropZone>
              </div>
            </div>
          ))}
        </div>

        {/* الـ Events نفسها (overlay فوق الأعمدة) */}
        <div
          className="relative pointer-events-none"
          style={{ height: timelineHeight }}
        >
          {metaItems.map((item) => (
            <div
              key={item.job.id}
              className="absolute pointer-events-auto px-1"
              style={{
                left: `${item.leftPct}%`,
                width: `${item.widthPct}%`,
                top: `${item.lane * (LANE_HEIGHT + LANE_GAP)}px`,
              }}
            >
              <JobCard
                job={item.job}
                resources={state}
                isAdmin={isAdmin}
                onOpen={() => onOpenJob(item.job.id)}
                onDelete={(jobId) => onDeleteJob(jobId)}
                onUpdate={(jobId, data) => onUpdateJob(jobId, data)}
                onDuplicate={(jobId) => onDuplicateJob && onDuplicateJob(jobId)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
