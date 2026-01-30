// src/components/WeekView.jsx
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { labelsFor } from "../constants/trailerTaxonomy";
import { getJobSegmentForDay } from "../lib/jobTime";
import { jobShortKey } from "../lib/jobKey";

const STATUS_COLORS = {
  incomplete: "bg-gray-400",
  waiting: "bg-yellow-400",
  processed_soon: "bg-orange-500",
  processed: "bg-blue-500",
  complete: "bg-green-600",
};

/* ===== Helpers (محلية 100%) ===== */
function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseISODateLocal(str) {
  const [y, m, d] = String(str)
    .split("-")
    .map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0); // محلي
}

function formatDateLocal(date) {
  return toISODateLocal(date); // ثابت بدون مشاكل UTC
}

function startOfWeekMonday(dateISO) {
  const d = parseISODateLocal(dateISO);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return toISODateLocal(monday);
}
function getWeekDays(weekStartISO) {
  const base = parseISODateLocal(weekStartISO);
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

/* ===== تحذيرات الجوب والوان الكارد ===== */
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
    // أخضر فاتح للجوب اللي خلص فعلاً
    return "bg-green-50 border-green-300";
  }
  if (warnings && warnings.length > 0) {
    // أصفر فاتح للجوب اللي ناقصه بيانات
    return "bg-yellow-50 border-yellow-300";
  }
  // أبيض للجوب اللي بياناته كاملة ولسه ما اشتغلش
  return "bg-white border-gray-200";
}

/* ===== Droppable slot ===== */
function SlotDroppable({ dateISO, slot, children, highlight = false }) {
  const id = `slot|${dateISO}|${slot}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "min-h-[110px] rounded-lg border border-dashed transition-colors",
        isOver ? "border-blue-400 bg-blue-50/60" : "border-gray-200 bg-white",
        highlight ? "ring-1 ring-blue-300" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ===== Job card (weekly) ===== */

/** لون مخصص للكارد (خلفية كاملة) + Auto-contrast */
function isValidHexColor(c) {
  const s = String(c || "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}
function normalizeHex(hex) {
  const s = String(hex || "").trim();
  if (!isValidHexColor(s)) return null;
  if (s.length === 4) {
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
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relLuminance({ r, g, b }) {
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
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  return contrastWhite >= contrastBlack;
}
function getStateRing(job, warnings, seg) {
  if (seg?.isMultiDay) return "ring-2 ring-purple-500/25";
  if (isJobCompleted(job)) return "ring-2 ring-green-500/25";
  if (Array.isArray(warnings) && warnings.length > 0) return "ring-2 ring-amber-500/25";
  return "";
}

function JobCard({
  job,
  seg,
  onOpen,
  onDelete,
  isAdmin,
  driverEntries,
  tractor,
  trailer,
  warnings = [],
}) {
  const shortKey = jobShortKey(job.id);
  const trailerTypes = trailer
    ? Array.isArray(trailer.types)
      ? trailer.types
      : trailer.type
      ? [trailer.type]
      : []
    : [];
  const trailerTypeLabels = labelsFor(trailerTypes);

  const bgClass = getJobBgClass(job, warnings);
  const { setNodeRef, isOver } = useDroppable({ id: job.id });

  const start = job.start || (job.slot === "night" ? "20:00" : "08:00");
  const dur = job.durationHours || 0;

  const accentColor = isValidHexColor(job?.color) ? normalizeHex(job.color) : null;
  const useAccentBg = !!accentColor && !isOver;
  const useLightText = useAccentBg ? shouldUseLightText(accentColor) : false;

  const tPrimary = useAccentBg
    ? useLightText ? "text-white" : "text-gray-900"
    : "text-gray-800";

  const tSecondary = useAccentBg
    ? useLightText ? "text-white/90" : "text-gray-800"
    : "text-gray-500";

  const badgeBase = useAccentBg
    ? (useLightText ? "bg-white/15 text-white border border-white/25" : "bg-white/70 text-gray-800 border border-black/10")
    : "bg-white/70 text-gray-700 border border-gray-200";

  const chipOk = useAccentBg
    ? (useLightText ? "bg-white/15 text-white" : "bg-white/70 text-gray-900")
    : "bg-sky-50 text-sky-700";

  const chipWarn = useAccentBg
    ? (useLightText ? "bg-black/15 text-white" : "bg-white/70 text-orange-800")
    : "bg-orange-50 text-orange-700";

  const warnText = useAccentBg
    ? (useLightText ? "text-white/95" : "text-orange-800")
    : "text-orange-700";

  return (
    <div
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
      className={[
        "relative rounded-lg border shadow-sm p-3 mb-2 cursor-pointer transition-colors",
        useAccentBg ? "" : bgClass,
        getStateRing(job, warnings, seg),
        isOver ? "border-blue-400 ring-2 ring-blue-100 bg-blue-50/60" : "",
      ].join(" ")}
      onClick={() => onOpen(job.id)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div
          className={`text-xs font-semibold min-w-0 ${tPrimary}`}
          title={`${job.client || "New Client"}${shortKey ? ` (#${shortKey})` : ""}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{job.client || "New Client"}</span>
            {job?.code ? (
              <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${badgeBase}`}>
                {job.code}
              </span>
            ) : null}
            {shortKey ? (
              <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${badgeBase}`}>
                #{shortKey}
              </span>
            ) : null}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(job.id);
            }}
            className={useAccentBg ? (useLightText ? "text-white/80 hover:text-white" : "text-gray-700 hover:text-gray-900") : "text-[10px] text-red-500 hover:text-red-700"}
          >
            ×
          </button>
        )}
      </div>

      <div className={`text-[11px] mb-1 ${tSecondary}`}>
        {seg ? `${seg.displayStart} → ${seg.displayEnd}` : start} •{" "}
        {seg
          ? `${Math.max(0, (seg.endMinutes - seg.startMinutes) / 60)
              .toFixed(1)
              .replace(/\.0$/, "")}h`
          : `${dur}h`}
      </div>

      {seg?.isMultiDay ? (
        <div className={`text-[10px] mb-1 ${useAccentBg ? (useLightText ? "text-white/90" : "text-purple-900") : "text-purple-700"}`}>
          {seg.startsPrevDay ? `↩ Started ${seg.originalStartISO} ${seg.originalStartTime}` : null}
          {seg.startsPrevDay && seg.endsNextDay ? " • " : null}
          {seg.endsNextDay ? `↪ Ends ${seg.originalEndISO} ${seg.originalEndTime}` : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 mb-1">
        {tractor ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipOk}`}>
            🚚 {tractor.code || tractor.plate || tractor.id}
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipWarn}`}>
            <AlertTriangle size={10} /> Missing tractor
          </span>
        )}

        {trailer ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipOk}`}>
            🧷 {trailer.code || trailer.plate || trailer.id}
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipWarn}`}>
            <AlertTriangle size={10} /> Missing trailer
          </span>
        )}

        {driverEntries && driverEntries.length > 0 ? (
          driverEntries.map((d) => (
            <span
              key={d.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipOk}`}
            >
              👤 {d.name}
            </span>
          ))
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${chipWarn}`}>
            <AlertTriangle size={10} /> Missing driver
          </span>
        )}

        {trailerTypeLabels && trailerTypeLabels.length > 0 ? (
          trailerTypeLabels.map((lbl) => (
            <span
              key={lbl}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${badgeBase}`}
            >
              {lbl}
            </span>
          ))
        ) : null}
      </div>

      {/* warnings list */}
      {/* {warnings && warnings.length > 0 ? (
        <div className="mt-1 space-y-1">
          {warnings.slice(0, 3).map((w, idx) => (
            <div key={idx} className={`flex items-center gap-1 text-[11px] ${warnText}`}>
              <AlertTriangle size={12} />
              <span className="truncate">{w}</span>
            </div>
          ))}
        </div>
      ) : null} */}
    </div>
  );
}

/* ===== WeekView الرئيسي ===== */
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
  // ✅ Monday-first week using LOCAL dates
  const weekStartISO = startOfWeekMonday(
    state?.weekStart || toISODateLocal(new Date())
  );
  const days = getWeekDays(weekStartISO);
  const allJobs = Array.isArray(state?.jobs) ? state.jobs : [];
  const todayISO = toISODateLocal(new Date());

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
          const isToday = iso === todayISO;

          const bigWeekday = dayDate.toLocaleDateString(undefined, {
            weekday: "long",
          });
          const smallWeekday = dayDate.toLocaleDateString(undefined, {
            weekday: "short",
          });
          const dayNum = dayDate.getDate();

          const jobSegmentsOfDay = allJobs
            .map((job) => {
              const seg = getJobSegmentForDay(job, iso);
              if (!seg) return null;
              return {
                job: { ...job, slot: job.slot === "night" ? "night" : "day" },
                seg,
              };
            })
            .filter(Boolean)
            .filter(({ job }) => jobPassesFilters(job));

          const dayJobs = jobSegmentsOfDay.filter((x) => x.seg.displaySlot === "day");
          const nightJobs = jobSegmentsOfDay.filter((x) => x.seg.displaySlot === "night");

          return (
            <div key={iso} className="flex flex-col gap-2">
              <Link to={`/day/${iso}`}>
                <div
                  className={[
                    "rounded-lg bg-gray-50 border p-2 text-center transition-all",
                    isToday
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-gray-200",
                  ].join(" ")}
                >
                  <div className="text-xs font-semibold text-gray-700 truncate">
                    {bigWeekday}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {smallWeekday} • {dayNum}
                  </div>
                </div>
              </Link>

              {/* DAY SLOT */}
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
              <SlotDroppable dateISO={iso} slot="day" highlight={isToday}>
                <div className="p-2">
                  {dayJobs.length === 0 ? (
                    <div className="text-[10px] text-gray-400 italic">
                      {isAdmin ? "Drop here or click +" : "No jobs"}
                    </div>
                  ) : (
                    dayJobs.map(({ job, seg }) => {
                      const driverEntries = (job.driverIds || [])
                        .map((dId) => {
                          const d = state.drivers?.find(
                            (d) => String(d.id) === String(dId)
                          );
                          return d
                            ? {
                                id: String(d.id),
                                label: d.name || d.code || String(d.id),
                              }
                            : null;
                        })
                        .filter(Boolean);

                      const tractor = (state.tractors || []).find(
                        (t) => String(t.id) === String(job.tractorId)
                      );
                      const trailer = (state.trailers || []).find(
                        (t) => String(t.id) === String(job.trailerId)
                      );

                      const warnings = getJobWarnings(job, {
                        drivers: state.drivers || [],
                        tractors: state.tractors || [],
                        trailers: state.trailers || [],
                      });

                      return (
                        <JobCard
                          key={job.id}
                          job={job}
                          seg={seg}
                          onOpen={onOpenJob}
                          onDelete={onDeleteJob}
                          isAdmin={isAdmin}
                          driverEntries={driverEntries}
                          tractor={tractor}
                          trailer={trailer}
                          warnings={warnings}
                        />
                      );
                    })
                  )}
                </div>
              </SlotDroppable>

              {/* NIGHT SLOT */}
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
              <SlotDroppable dateISO={iso} slot="night" highlight={isToday}>
                <div className="p-2">
                  {nightJobs.length === 0 ? (
                    <div className="text-[10px] text-gray-400 italic">
                      {isAdmin ? "Drop here or click +" : "No jobs"}
                    </div>
                  ) : (
                    nightJobs.map(({ job, seg }) => {
                      const driverEntries = (job.driverIds || [])
                        .map((dId) => {
                          const d = state.drivers?.find(
                            (d) => String(d.id) === String(dId)
                          );
                          return d
                            ? {
                                id: String(d.id),
                                label: d.name || d.code || String(d.id),
                              }
                            : null;
                        })
                        .filter(Boolean);

                      const tractor = (state.tractors || []).find(
                        (t) => String(t.id) === String(job.tractorId)
                      );
                      const trailer = (state.trailers || []).find(
                        (t) => String(t.id) === String(job.trailerId)
                      );

                      const warnings = getJobWarnings(job, {
                        drivers: state.drivers || [],
                        tractors: state.tractors || [],
                        trailers: state.trailers || [],
                      });

                      return (
                        <JobCard
                          key={job.id}
                          job={job}
                          seg={seg}
                          onOpen={onOpenJob}
                          onDelete={onDeleteJob}
                          isAdmin={isAdmin}
                          driverEntries={driverEntries}
                          tractor={tractor}
                          trailer={trailer}
                          warnings={warnings}
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
