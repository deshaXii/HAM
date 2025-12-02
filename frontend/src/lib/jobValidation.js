// src/lib/jobValidation.js

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

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const total = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  return `${pad(h)}:${pad(m)}`;
}

function rangesOverlap(startA, durA, startB, durB) {
  const a1 = timeToMinutes(startA);
  const a2 = a1 + (durA || 0) * 60;
  const b1 = timeToMinutes(startB);
  const b2 = b1 + (durB || 0) * 60;
  return Math.max(a1, b1) < Math.min(a2, b2);
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

function driverWorksOnDay(driver, isoDate) {
  const list = normalizeWeekAvailability(driver?.weekAvailability);
  if (list === null) return true;
  if (Array.isArray(list) && list.length === 0) return false;
  const weekdayJs = new Date(shortIso(isoDate)).getDay();
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
  if (job.slot === "night" && driver?.canNight === false) return false;
  if (!driverWorksOnDay(driver || {}, job.date)) return false;
  if (driverOnLeave(driver || {}, job.date)) return false;
  return true;
}

function getEffectiveDurationHours(job) {
  const real = Number(job.durationHours || 0);
  if (!real || real < 0) return 0;
  return real;
}

function isResourceBusy(jobs, excludeJobId, dateISO, start, dur, predicate) {
  return (jobs || []).some((other) => {
    if (other.id === excludeJobId) return false;
    if (shortIso(other.date) !== shortIso(dateISO)) return false;
    const otherDur = getEffectiveDurationHours(other);
    return predicate(other) && rangesOverlap(start, dur, other.start, otherDur);
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

  // drivers
  if (Array.isArray(candidateJob.driverIds)) {
    for (const dId of candidateJob.driverIds) {
      const driver = (state.drivers || []).find((d) => d.id === dId);

      if (!driverAllowedForJob(driver, candidateJob)) {
        return {
          ok: false,
          reason: `Driver "${
            driver?.name || dId
          }" is not available on ${shortIso(candidateJob.date)}.`,
        };
      }

      const busy = isResourceBusy(
        state.jobs,
        originalJobId,
        candidateJob.date,
        start,
        dur,
        (other) =>
          Array.isArray(other.driverIds) && other.driverIds.includes(dId)
      );
      if (busy) {
        return {
          ok: false,
          reason: `Driver "${
            driver?.name || dId
          }" is already busy on ${shortIso(
            candidateJob.date
          )} at ${start} for ${dur}h.`,
        };
      }
      if (exceedsDriverLimitForTractor(state, candidateJob, dId)) {
        return {
          ok: false,
          reason:
            "This tractor does not allow more drivers for this job (2-man rule).",
        };
      }
    }
  }

  // tractor
  if (candidateJob.tractorId) {
    const busyTr = isResourceBusy(
      state.jobs,
      originalJobId,
      candidateJob.date,
      start,
      dur,
      (o) => String(o.tractorId) === String(candidateJob.tractorId)
    );
    if (busyTr)
      return {
        ok: false,
        reason: `This tractor is already busy on ${shortIso(
          candidateJob.date
        )} at ${start}.`,
      };
  }

  // trailer
  if (candidateJob.trailerId) {
    const busyTrl = isResourceBusy(
      state.jobs,
      originalJobId,
      candidateJob.date,
      start,
      dur,
      (o) => String(o.trailerId) === String(candidateJob.trailerId)
    );
    if (busyTrl)
      return {
        ok: false,
        reason: `This trailer is already busy on ${shortIso(
          candidateJob.date
        )} at ${start}.`,
      };
  }

  return { ok: true };
}
