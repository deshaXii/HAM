// src/components/WeekView.jsx
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

function formatDateLocal(date) {
  return date.toLocaleDateString("en-CA");
}

function getWeekDays(weekStartISO) {
  const base = new Date(weekStartISO);
  base.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function SlotDroppable({ dateISO, slot, children }) {
  const id = `slot|${dateISO}|${slot}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[110px] rounded-lg border border-dashed transition-colors ${
        isOver ? "border-blue-400 bg-blue-50/60" : "border-gray-200 bg-white"
      }`}
    >
      {children}
    </div>
  );
}

function JobCard({
  job,
  onOpen,
  onDelete,
  isAdmin,
  driverNames,
  tractor,
  trailer,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: job.id,
  });

  const start = job.start || (job.slot === "night" ? "20:00" : "08:00");
  const dur = job.durationHours || 0;
  const pricing =
    job.pricing?.type === "per_km"
      ? `€ ${job.pricing.value || 0}/km`
      : job.pricing?.type === "fixed"
      ? "fixed"
      : "";

  return (
    <div
      ref={setNodeRef}
      className={`relative bg-white rounded-lg border shadow-sm p-3 mb-2 cursor-pointer transition-colors ${
        isOver ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"
      }`}
      onClick={() => onOpen(job.id)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-xs font-semibold text-gray-800 truncate">
          {job.client || "New Client"}
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(job.id);
            }}
            className="text-[10px] text-red-500 hover:text-red-700"
          >
            ×
          </button>
        )}
      </div>
      <div className="text-[11px] text-gray-500 mb-1">
        {start} • {dur}h
      </div>

      <div className="flex flex-wrap gap-1 mb-1">
        {tractor ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px]">
            🚚 {tractor.code || tractor.plate || tractor.id}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px]">
            <AlertTriangle size={10} /> Missing tractor
          </span>
        )}

        {trailer ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px]">
            🛞 {trailer.code || trailer.plate || trailer.id}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px]">
            <AlertTriangle size={10} /> Missing trailer
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {driverNames && driverNames.length > 0 ? (
          driverNames.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px]"
            >
              👤 {n}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px]">
            <AlertTriangle size={10} /> Missing driver
          </span>
        )}
      </div>

      {pricing ? (
        <div className="mt-2 text-[10px] text-gray-400 border-t pt-1">
          {pricing}
        </div>
      ) : null}
    </div>
  );
}

export default function WeekView({
  state,
  onAddJob,
  onDeleteJob,
  onOpenJob,
  isAdmin,
  filterTractor,
  filterTrailer,
  filterDriver,
}) {
  const weekStartISO =
    state?.weekStart || new Date().toISOString().slice(0, 10);
  const days = getWeekDays(weekStartISO);
  const allJobs = Array.isArray(state?.jobs) ? state.jobs : [];

  function jobPassesFilters(job) {
    if (filterTractor && String(job.tractorId) !== String(filterTractor))
      return false;
    if (filterTrailer && String(job.trailerId) !== String(filterTrailer))
      return false;
    if (filterDriver) {
      if (
        !Array.isArray(job.driverIds) ||
        !job.driverIds.includes(filterDriver)
      )
        return false;
    }
    return true;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 overflow-x-auto">
      <div className="grid grid-cols-7 gap-3 min-w-[1100px]">
        {days.map((dayDate) => {
          const iso = formatDateLocal(dayDate);

          const bigWeekday = dayDate.toLocaleDateString(undefined, {
            weekday: "long",
          });
          const smallWeekday = dayDate.toLocaleDateString(undefined, {
            weekday: "short",
          });
          const dayNum = dayDate.getDate();

          const jobsOfDay = allJobs
            .filter((j) => j.date && j.date.slice(0, 10) === iso)
            .filter(jobPassesFilters)
            .map((j) => ({
              ...j,
              slot: j.slot === "night" ? "night" : "day",
            }));

          const dayJobs = jobsOfDay.filter((j) => j.slot === "day");
          const nightJobs = jobsOfDay.filter((j) => j.slot === "night");

          return (
            <div key={iso} className="flex flex-col gap-2">
              <Link to={`/day/${iso}`}>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-center">
                  <div className="text-xs font-semibold text-gray-700 truncate">
                    {bigWeekday}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {smallWeekday} • {dayNum}
                  </div>
                </div>
              </Link>

              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-gray-500">
                  DAY
                </span>
                {isAdmin && (
                  <button
                    onClick={() => onAddJob(iso, "day")}
                    className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <SlotDroppable dateISO={iso} slot="day">
                <div className="p-2">
                  {dayJobs.length === 0 ? (
                    <div className="text-[10px] text-gray-400 italic">
                      {isAdmin ? "Drop here or click +" : "No jobs"}
                    </div>
                  ) : (
                    dayJobs.map((job) => {
                      const driverNames = (job.driverIds || [])
                        .map((dId) => state.drivers?.find((d) => d.id === dId))
                        .filter(Boolean)
                        .map((d) => d.name || d.code || d.id);
                      const tractor = (state.tractors || []).find(
                        (t) => String(t.id) === String(job.tractorId)
                      );
                      const trailer = (state.trailers || []).find(
                        (t) => String(t.id) === String(job.trailerId)
                      );
                      return (
                        <JobCard
                          key={job.id}
                          job={job}
                          onOpen={onOpenJob}
                          onDelete={onDeleteJob}
                          isAdmin={isAdmin}
                          driverNames={driverNames}
                          tractor={tractor}
                          trailer={trailer}
                        />
                      );
                    })
                  )}
                </div>
              </SlotDroppable>

              <div className="flex items-center justify-between mb-1 mt-1">
                <span className="text-[10px] font-semibold text-gray-500">
                  NIGHT
                </span>
                {isAdmin && (
                  <button
                    onClick={() => onAddJob(iso, "night")}
                    className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <SlotDroppable dateISO={iso} slot="night">
                <div className="p-2">
                  {nightJobs.length === 0 ? (
                    <div className="text-[10px] text-gray-400 italic">
                      {isAdmin ? "Drop here or click +" : "No jobs"}
                    </div>
                  ) : (
                    nightJobs.map((job) => {
                      const driverNames = (job.driverIds || [])
                        .map((dId) => state.drivers?.find((d) => d.id === dId))
                        .filter(Boolean)
                        .map((d) => d.name || d.code || d.id);
                      const tractor = (state.tractors || []).find(
                        (t) => String(t.id) === String(job.tractorId)
                      );
                      const trailer = (state.trailers || []).find(
                        (t) => String(t.id) === String(job.trailerId)
                      );
                      return (
                        <JobCard
                          key={job.id}
                          job={job}
                          onOpen={onOpenJob}
                          onDelete={onDeleteJob}
                          isAdmin={isAdmin}
                          driverNames={driverNames}
                          tractor={tractor}
                          trailer={trailer}
                        />
                      );
                    })
                  )}
                </div>
              </SlotDroppable>
            </div>
          );
        })}
      </div>
    </div>
  );
}
