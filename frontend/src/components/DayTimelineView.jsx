import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import JobCard from "./JobCard";

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
      className={`rounded-xl border border-transparent p-2 min-h-20 ${
        isOver ? "ring-2 ring-blue-400 ring-offset-1 bg-blue-50" : ""
      }`}
    >
      {children}
    </div>
  );
}

// السلوطات اللي بنعرضها في صفحة اليوم
const TIME_SLOTS = [
  { key: "00-04", label: "00:00 - 04:00", startMin: 0, startMax: 3 },
  { key: "04-08", label: "04:00 - 08:00", startMin: 4, startMax: 7 },
  { key: "08-12", label: "08:00 - 12:00", startMin: 8, startMax: 11 },
  { key: "12-16", label: "12:00 - 16:00", startMin: 12, startMax: 15 },
  { key: "16-20", label: "16:00 - 20:00", startMin: 16, startMax: 19 },
  { key: "20-24", label: "20:00 - 24:00", startMin: 20, startMax: 23 },
  { key: "flex", label: "Other / Flex", startMin: null, startMax: null },
];

// نحدد السلوط بتاع الجوب حسب ساعة البداية
function getSlotKeyForJob(job) {
  if (!job.start) return "flex";
  const hour = parseInt(job.start.split(":")[0] || "0", 10);

  for (const slot of TIME_SLOTS) {
    if (
      slot.startMin !== null &&
      hour >= slot.startMin &&
      hour <= slot.startMax
    ) {
      return slot.key;
    }
  }

  return "flex";
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
  onOpenJob,
}) {
  // الأول: هات كل الشغلانات لليوم ده
  let todaysJobs = (state.jobs || []).filter((job) => job.date === date);

  // ثانيًا: طبّق الفلاتر
  todaysJobs = todaysJobs.filter((job) => {
    if (filterTractor && job.tractorId !== filterTractor) {
      return false;
    }
    if (filterTrailer && job.trailerId !== filterTrailer) {
      return false;
    }
    if (filterDriver && !(job.driverIds || []).includes(filterDriver)) {
      return false;
    }
    return true;
  });

  // دالة ترجع الجوبز اللي تقع تحت slotKey معيّن بعد الفلاتر
  const getJobsForSlot = (slotKey) => {
    return todaysJobs.filter((job) => getSlotKeyForJob(job) === slotKey);
  };

  const humanDateLabel = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Day Planning</h2>
        <div className="text-sm text-gray-600">{humanDateLabel}</div>
      </div>

      {/* timeline = rows لكل slot */}
      <div className="grid grid-cols-1 gap-4">
        {TIME_SLOTS.map((slot) => (
          <div
            key={slot.key}
            className="bg-gray-50 rounded-lg p-3 border border-gray-200"
          >
            {/* Slot header (اسم الفترة + زر إضافة لو admin) */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                {slot.label}
              </span>

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

            {/* Drop zone for this slot */}
            <TimeSlotDropZone date={date} slotKey={slot.key}>
              <div className="space-y-2">
                {getJobsForSlot(slot.key).map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    resources={state}
                    isAdmin={isAdmin}
                    onOpen={() => onOpenJob(job.id)}
                    onDelete={(jobId) => onDeleteJob(jobId)}
                    onUpdate={(jobId, data) => onUpdateJob(jobId, data)}
                  />
                ))}
              </div>
            </TimeSlotDropZone>
          </div>
        ))}
      </div>
    </div>
  );
}
