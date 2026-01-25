// src/lib/jobValidation.js
// Validation for jobs (drivers / tractors / trailers) with true time-interval overlap support.
// Supports overnight jobs that span multiple days.

import {
  getJobInterval,
  getJobTouchedDays,
  intervalsOverlap,
  parseISODateLocal,
  minutesToTime,
  toISODateLocal,
} from "./jobTime";

const DAY_NAME_TO_NUM = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function shortIso(x) {
  return String(x || "").slice(0, 10);
}

function defaultStartForSlot(slot) {
  if (slot === "night") return "20:00";
  return "08:00";
}

/* ===== week availability ===== */
function normalizeWeekAvailability(wa) {
  if (wa === null || wa === undefined) return null;
  if (Array.isArray(wa)) {
    return wa
      .map((v) => {
        if (typeof v === "number") return v;
        const s = String(v).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(DAY_NAME_TO_NUM, s))
          return DAY_NAME_TO_NUM[s];
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
        if (Object.prototype.hasOwnProperty.call(DAY_NAME_TO_NUM, s))
          return DAY_NAME_TO_NUM[s];
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter((x) => x !== null);
  }
  return null;
}

function driverWorksOnDay(driver, isoDate) {
  const list = normalizeWeekAvailability(driver?.weekAvailability);
  if (list === null) return true;
  if (Array.isArray(list) && list.length === 0) return false;
  const weekdayJs = parseISODateLocal(shortIso(isoDate)).getDay();
  return list.includes(weekdayJs);
}

function driverOnLeave(driver, isoDate) {
  const arr =
    Array.isArray(driver?.leaves) && driver.leaves.length
      ? driver.leaves
      : typeof driver?.leaves === "string" && driver.leaves.trim()
      ? driver.leaves.split(",").map((s) => s.trim())
      : [];
  const normalized = arr.map((d) => shortIso(d));
  return normalized.includes(shortIso(isoDate));
}

function driverAllowedForJob(driver, job) {
  // night permission applies based on job start slot
  if (job.slot === "night" && driver?.canNight === false) return false;

  const touchedDays = getJobTouchedDays(job);
  const days = touchedDays.length ? touchedDays : [job.date];

  for (const dayISO of days) {
    if (!driverWorksOnDay(driver || {}, dayISO)) return false;
    if (driverOnLeave(driver || {}, dayISO)) return false;
  }
  return true;
}

function getEffectiveDurationHours(job) {
  const real = Number(job.durationHours || 0);
  if (!real || real < 0) return 0;
  return real;
}

function formatInterval(job) {
  const interval = getJobInterval(job);
  if (!interval) {
    const s = job.start || "--:--";
    return `${shortIso(job.date)} ${s}`;
  }
  const start = interval.start;
  const end = interval.end;
  const startISO = toISODateLocal(start);
  const endISO = toISODateLocal(end);
  const startTime = job.start || minutesToTime(0);
  const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(
    end.getMinutes()
  ).padStart(2, "0")}`;
  return `${startISO} ${startTime} → ${endISO} ${endTime}`;
}

function isResourceBusy(jobs, excludeJobId, candidateJob, predicate) {
  const candInterval = getJobInterval(candidateJob);
  if (!candInterval) return false;

  return (jobs || []).some((other) => {
    if (!other) return false;
    if (other.id === excludeJobId) return false;
    if (!predicate(other)) return false;

    const otherStart = other.start || defaultStartForSlot(other.slot);
    const otherDur = getEffectiveDurationHours(other);
    if (!other.date || !otherStart || otherDur <= 0) return false;

    const otherNorm = { ...other, start: otherStart, durationHours: otherDur };
    const otherInterval = getJobInterval(otherNorm);
    if (!otherInterval) return false;

    return intervalsOverlap(
      candInterval.start,
      candInterval.end,
      otherInterval.start,
      otherInterval.end
    );
  });
}

function exceedsDriverLimitForTractor(state, job, newDriverId) {
  const tractor = (state.tractors || []).find((t) => t.id === job.tractorId);
  const currentDrivers = Array.isArray(job.driverIds) ? job.driverIds : [];
  const alreadyIn = currentDrivers.includes(newDriverId);
  if (alreadyIn) return false;
  const afterCount = currentDrivers.length + 1;
  const tractorAllowsTwo = tractor?.doubleManned === true;
  if (!tractorAllowsTwo && afterCount > 1) return true;
  if (tractorAllowsTwo && afterCount > 2) return true;
  return false;
}

export function validateWholeJob(state, candidateJob, originalJobId) {
  const start = candidateJob.start || defaultStartForSlot(candidateJob.slot);
  const dur = getEffectiveDurationHours(candidateJob);
  const candidateNorm = { ...candidateJob, start, durationHours: dur };

  // If job has no schedule yet, allow edits (conflicts only apply when scheduled)
  if (!candidateNorm.date || !candidateNorm.start || !candidateNorm.durationHours) {
    return { ok: true };
  }

  const intervalLabel = formatInterval(candidateNorm);

  // drivers
  if (Array.isArray(candidateNorm.driverIds)) {
    for (const dId of candidateNorm.driverIds) {
      const driver = (state.drivers || []).find((d) => d.id === dId);

      if (!driverAllowedForJob(driver, candidateNorm)) {
        return {
          ok: false,
          reason: `Driver "${driver?.name || dId}" is not available for ${intervalLabel}.`,
        };
      }

      const busy = isResourceBusy(
        state.jobs,
        originalJobId,
        candidateNorm,
        (other) => Array.isArray(other.driverIds) && other.driverIds.includes(dId)
      );

      if (busy) {
        return {
          ok: false,
          reason: `Driver "${driver?.name || dId}" is already busy during ${intervalLabel}.`,
        };
      }

      if (exceedsDriverLimitForTractor(state, candidateNorm, dId)) {
        return {
          ok: false,
          reason:
            "This tractor does not allow more drivers for this job (2-man rule).",
        };
      }
    }
  }

  // tractor
  if (candidateNorm.tractorId) {
    const busyTr = isResourceBusy(
      state.jobs,
      originalJobId,
      candidateNorm,
      (o) => String(o.tractorId) === String(candidateNorm.tractorId)
    );
    if (busyTr) {
      return {
        ok: false,
        reason: `This tractor is already busy during ${intervalLabel}.`,
      };
    }
  }

  // trailer
  if (candidateNorm.trailerId) {
    const busyTrl = isResourceBusy(
      state.jobs,
      originalJobId,
      candidateNorm,
      (o) => String(o.trailerId) === String(candidateNorm.trailerId)
    );
    if (busyTrl) {
      return {
        ok: false,
        reason: `This trailer is already busy during ${intervalLabel}.`,
      };
    }
  }

  return { ok: true };
}
