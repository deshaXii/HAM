// src/lib/jobTime.js
// Utilities for working with job times in LOCAL timezone (no UTC shifting).

export function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function parseISODateLocal(iso) {
  const [y, m, d] = String(iso || "")
    .slice(0, 10)
    .split("-")
    .map((n) => parseInt(n, 10));
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins) {
  const total = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Slot rule for UI: Day = 00:00->12:00, Night = 12:00->24:00
export function slotForMinutes(mins) {
  return mins >= 12 * 60 ? "night" : "day";
}

export function getJobInterval(job) {
  if (!job || !job.date || !job.start) return null;
  const durH = Number(job.durationHours || 0);
  if (!durH || durH <= 0) return null;

  const day = parseISODateLocal(job.date);
  const startM = timeToMinutes(job.start);
  const start = new Date(day.getTime() + startM * 60 * 1000);
  const end = new Date(start.getTime() + durH * 3600 * 1000);
  return { start, end };
}

export function getJobSegmentForDay(job, dayISO) {
  const interval = getJobInterval(job);
  if (!interval) return null;

  const { start, end } = interval;
  const dayStart = parseISODateLocal(dayISO);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const overlapStart = start > dayStart ? start : dayStart;
  const overlapEnd = end < dayEnd ? end : dayEnd;

  // half-open interval [start, end)
  if (overlapStart.getTime() >= overlapEnd.getTime()) return null;

  const startMinutes = Math.round((overlapStart.getTime() - dayStart.getTime()) / 60000);
  const endMinutes = Math.round((overlapEnd.getTime() - dayStart.getTime()) / 60000);

  const originalStartISO = toISODateLocal(start);
  const originalEndISO = toISODateLocal(new Date(end.getTime() - 1)); // subtract 1ms to avoid midnight edge

  const startsPrevDay = start.getTime() < dayStart.getTime();
  const endsNextDay = end.getTime() > dayEnd.getTime();

  const isMultiDay = originalStartISO !== originalEndISO;

  return {
    dayISO,
    startMinutes,
    endMinutes,
    startsPrevDay,
    endsNextDay,
    isMultiDay,
    originalStartISO,
    originalEndISO,
    originalStartTime: job.start,
    originalEndTime: minutesToTime(timeToMinutes(job.start) + Math.round((Number(job.durationHours || 0) * 60))),
    displayStart: minutesToTime(startMinutes),
    displayEnd: minutesToTime(endMinutes),
    displaySlot: slotForMinutes(startMinutes),
  };
}

export function getJobTouchedDays(job) {
  const interval = getJobInterval(job);
  if (!interval) return [];
  const { start, end } = interval;

  const days = [];
  // iterate by day boundaries that the interval overlaps
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const endMinus = new Date(end.getTime() - 1); // exclusive end
  const lastDay = new Date(endMinus.getFullYear(), endMinus.getMonth(), endMinus.getDate(), 0, 0, 0, 0);

  while (cursor.getTime() <= lastDay.getTime()) {
    days.push(toISODateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart.getTime(), bStart.getTime()) < Math.min(aEnd.getTime(), bEnd.getTime());
}
