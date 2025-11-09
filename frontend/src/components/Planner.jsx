// src/components/Planner.jsx
import React, { useState, useEffect } from "react";
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  Truck,
  Users,
  Package,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
} from "lucide-react";
import ResourcePool from "./ResourcePool";
import WeekView from "./WeekView";
import DistanceEditor from "./DistanceEditor";
import JobModal from "./JobModal";
import { apiGetState, apiSaveState } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return h * 60 + (m || 0);
}
function rangesOverlap(startA, durA, startB, durB) {
  const a1 = timeToMinutes(startA);
  const a2 = a1 + (durA || 0) * 60;
  const b1 = timeToMinutes(startB);
  const b2 = b1 + (durB || 0) * 60;
  return Math.max(a1, b1) < Math.min(a2, b2);
}
function defaultStartForSlot(slot) {
  return slot === "night" ? "20:00" : "08:00";
}
function normalizeJobSlot(job) {
  if (job.slot === "day" || job.slot === "night") return job;
  const hour = parseInt((job.start || "0").split(":")[0], 10);
  const normalizedSlot = hour >= 20 || hour < 8 ? "night" : "day";
  return { ...job, slot: normalizedSlot };
}

function normalizeLocations(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {
        id: "loc-depot-hoofddorp",
        name: "Depot-Hoofddorp",
        lat: 52.303,
        lng: 4.6901,
      },
      {
        id: "loc-ah-zaandam",
        name: "AH-Zaandam",
        lat: 52.438,
        lng: 4.826,
      },
      {
        id: "loc-aldi-culemborg",
        name: "Aldi-Culemborg",
        lat: 51.954,
        lng: 5.227,
      },
    ];
  }
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `loc-${idx}-${item.replace(/\s+/g, "-").toLowerCase()}`,
        name: item,
        lat: 52.1326,
        lng: 5.2913,
      };
    }
    return {
      id: item.id || `loc-${idx}-${(item.name || "loc").toLowerCase()}`,
      name: item.name || `Location ${idx + 1}`,
      lat: typeof item.lat === "number" ? item.lat : 52.1326,
      lng: typeof item.lng === "number" ? item.lng : 5.2913,
    };
  });
}

function buildSafeState(raw) {
  const src = raw || {};
  const jobs = Array.isArray(src.jobs) ? src.jobs.map(normalizeJobSlot) : [];

  // ما نحولش tractorId لأرقام.. سيبه زي ما جاي (string/GUID)
  const jobsWithNormalizedIds = jobs.map((j) => ({
    ...j,
    tractorId: j.tractorId ?? "", // لو undefined خليه ""
  }));

  const normalizedLocations = normalizeLocations(src.locations);
  return {
    jobs: jobsWithNormalizedIds,
    drivers: Array.isArray(src.drivers) ? src.drivers : [],
    tractors: Array.isArray(src.tractors) ? src.tractors : [],
    trailers: Array.isArray(src.trailers) ? src.trailers : [],
    locations: normalizedLocations,
    distanceKm:
      typeof src.distanceKm === "object" && src.distanceKm !== null
        ? src.distanceKm
        : {},
    settings:
      typeof src.settings === "object" && src.settings !== null
        ? src.settings
        : {
            rates: {
              loadedKmRevenue: 1.4,
              emptyKmCost: 0.6,
              tractorKmCostLoaded: 0.3,
              driverHourCost: 22.5,
              nightPremiumPct: 25,
            },
            trailerDayCost: {
              reefer: 35,
              box: 20,
              taut: 18,
              chassis: 15,
            },
          },
    weekStart: src.weekStart || new Date().toISOString().slice(0, 10),
  };
}

function shortIso(x) {
  if (!x) return "";
  return String(x).slice(0, 10);
}
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
  if (!wa && wa !== 0) return null;
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
  const weekday = new Date(shortIso(isoDate)).getDay();
  return list.includes(weekday);
}
function driverOnLeave(driver, isoDate) {
  const leaves =
    Array.isArray(driver?.leaves) && driver.leaves.length
      ? driver.leaves
      : typeof driver?.leaves === "string" && driver.leaves.trim()
      ? driver.leaves.split(",").map((s) => s.trim())
      : [];
  const normalized = leaves.map((d) => shortIso(d));
  return normalized.includes(shortIso(isoDate));
}
function getDriverBlockReason(driver, job) {
  if (!driver) return "driver-missing";
  const driverLabel = driver.name || driver.code || driver.id || "Driver";
  if (!driverWorksOnDay(driver, job.date)) {
    return `${driverLabel} does not work on ${job.date}.`;
  }
  if (driverOnLeave(driver, job.date)) {
    return `${driverLabel} is on leave on ${job.date}.`;
  }
  if (job.slot === "night" && driver.canNight === false) {
    return `${driverLabel} cannot take night jobs.`;
  }
  return null;
}
function isResourceBusy(state, excludeJobId, dateISO, start, dur, predicateFn) {
  return (state.jobs || []).some((other) => {
    if (other.id === excludeJobId) return false;
    if (shortIso(other.date) !== shortIso(dateISO)) return false;
    return (
      predicateFn(other) &&
      rangesOverlap(start, dur, other.start, other.durationHours)
    );
  });
}
function exceedsDriverLimitForTractor(state, job, newDriverId) {
  const tractor = (state.tractors || []).find((t) => t.id === job.tractorId);
  const currentDrivers = Array.isArray(job.driverIds) ? job.driverIds : [];
  const alreadyIn = currentDrivers.includes(newDriverId);
  if (alreadyIn) return false;
  const afterCount = currentDrivers.length + 1;
  // If tractor unknown yet → allow up to 2 drivers tentatively
  if (!tractor) {
    return afterCount > 2;
  }
  const tractorAllowsTwo = tractor?.doubleManned === true;
  if (!tractorAllowsTwo && afterCount > 1) return true;
  if (tractorAllowsTwo && afterCount > 2) return true;
  return false;
}
function validateWholeJob(state, candidateJob, originalJobId) {
  const start = candidateJob.start || defaultStartForSlot(candidateJob.slot);
  const dur = candidateJob.durationHours || 0;

  if (Array.isArray(candidateJob.driverIds)) {
    /* VALIDATE DOUBLE-MANNED ELIGIBILITY */
    const tractor = (state.tractors || []).find(
      (t) => String(t.id) === String(candidateJob.tractorId)
    );
    const driversArr = Array.isArray(candidateJob.driverIds)
      ? candidateJob.driverIds.filter(Boolean)
      : [];
    // If tractor is known: enforce MAX only (no min). If no tractor yet: allow up to 2 temporarily.
    if (tractor) {
      const maxDrivers = tractor?.doubleManned === true ? 2 : 1;
      if (driversArr.length > maxDrivers) {
        return {
          ok: false,
          reason: "This tractor does not allow more drivers for this job.",
        };
      }
    } else {
      if (driversArr.length > 2) {
        return {
          ok: false,
          reason:
            "A job cannot have more than two drivers before selecting a tractor.",
        };
      }
    }

    for (const dId of candidateJob.driverIds) {
      const driver = (state.drivers || []).find((d) => d.id === dId);
      const blockReason = getDriverBlockReason(driver, candidateJob);
      if (blockReason && blockReason !== "driver-missing") {
        return { ok: false, reason: blockReason };
      }
      const busy = isResourceBusy(
        state,
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
          reason: `Driver "${driver?.name || dId}" is already busy on ${
            candidateJob.date
          } at ${start} for ${dur}h.`,
        };
      }
      // Check compatibility for double-manned jobs
      if (
        tractor?.doubleManned === true &&
        driver &&
        driver.doubleMannedEligible === false
      ) {
        return {
          ok: false,
          reason: `Driver "${
            driver.name || dId
          }" cannot work as part of a double-manned crew.`,
        };
      }
      if (exceedsDriverLimitForTractor(state, candidateJob, dId)) {
        return {
          ok: false,
          reason: "This tractor does not allow more drivers for this job.",
        };
      }
    }
  }

  if (candidateJob.tractorId) {
    const busyTr = isResourceBusy(
      state,
      originalJobId,
      candidateJob.date,
      start,
      dur,
      (o) => String(o.tractorId) === String(candidateJob.tractorId)
    );
    if (busyTr) {
      return {
        ok: false,
        reason: "This tractor is already busy at that time.",
      };
    }
  }

  if (candidateJob.trailerId) {
    const busyTrl = isResourceBusy(
      state,
      originalJobId,
      candidateJob.date,
      start,
      dur,
      (o) => String(o.trailerId) === String(candidateJob.trailerId)
    );
    if (busyTrl) {
      return {
        ok: false,
        reason: "This trailer is already busy at that time.",
      };
    }
  }

  return { ok: true };
}
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Planner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); // <<< NEW
  const [showDistanceEditor, setShowDistanceEditor] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTractor, setFilterTractor] = useState("");
  const [filterTrailer, setFilterTrailer] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const safe = buildSafeState(apiState);
        setState(safe);
      } catch (e) {
        console.error("failed to load planner state", e);
        setState(buildSafeState(null));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persistIfAdmin(nextState) {
    const safe = buildSafeState(nextState);
    setState(safe);
    if (isAdmin) {
      setSaving(true);
      try {
        await apiSaveState(safe);
      } catch (e) {
        console.error("failed saving planner state", e);
      } finally {
        setSaving(false);
      }
    }
  }

  function openJobModal(jobId) {
    setSelectedJobId(jobId);
  }
  function closeJobModal() {
    setSelectedJobId(null);
  }

  const selectedJob =
    state && selectedJobId
      ? state.jobs.find((j) => j.id === selectedJobId)
      : null;

  function addNewJob(dayDate, slot) {
    if (!isAdmin) {
      alert("Only admin can add jobs");
    } else {
      const newId = `job-${crypto.randomUUID()}`;
      const newJob = {
        id: newId,
        date: dayDate,
        slot,
        start: defaultStartForSlot(slot),
        durationHours: 8,
        client: "",
        pickup: "",
        dropoff: "",
        tractorId: "",
        trailerId: "",
        driverIds: [],
        pricing: { type: "fixed", value: "" },
        notes: "",
      };
      persistIfAdmin({
        ...state,
        jobs: [...(state.jobs || []), newJob],
      });
    }
  }

  function updateJob(jobId, updates) {
    const oldJob = (state.jobs || []).find((j) => j.id === jobId);
    if (!oldJob) return;

    const candidate = normalizeJobSlot({
      ...oldJob,
      ...updates,
    });

    if (
      candidate.tractorId !== null &&
      candidate.tractorId !== undefined &&
      candidate.tractorId !== "" &&
      !Number.isNaN(Number(candidate.tractorId))
    ) {
      candidate.tractorId = Number(candidate.tractorId);
    }

    const check = validateWholeJob(state, candidate, jobId);
    if (!check.ok) {
      alert(check.reason);
      return;
    }

    const next = {
      ...state,
      jobs: (state.jobs || []).map((j) => (j.id === jobId ? candidate : j)),
    };
    persistIfAdmin(next);
  }

  function deleteJob(jobId) {
    if (!window.confirm("Delete this job?")) return;
    const next = {
      ...state,
      jobs: (state.jobs || []).filter((j) => j.id !== jobId),
    };
    persistIfAdmin(next);
  }

  function getJobById(id) {
    return (state.jobs || []).find((j) => j.id === id);
  }

  function moveJobToSlotValidated(jobId, date, slot) {
    if (!isAdmin) return;
    const job = getJobById(jobId);
    if (!job) return;

    const proposed = {
      ...job,
      date,
      slot,
      start: defaultStartForSlot(slot),
    };

    const check = validateWholeJob(state, proposed, jobId);
    if (!check.ok) {
      alert(check.reason);
      return;
    }

    const next = {
      ...state,
      jobs: (state.jobs || []).map((j) =>
        j.id === jobId ? { ...proposed } : j
      ),
    };
    persistIfAdmin(next);
  }

  function assignResourceToJob(job, resourceType, resourceId) {
    if (!isAdmin) return;

    const start = job.start || defaultStartForSlot(job.slot);
    const dur = job.durationHours || 0;

    if (resourceType === "driver") {
      const driver = (state.drivers || []).find((d) => d.id === resourceId);
      if (!driver) return;

      const blockReason = getDriverBlockReason(driver, job);
      if (blockReason && blockReason !== "driver-missing") {
        alert(blockReason);
        return;
      }

      const busy = isResourceBusy(
        state,
        job.id,
        job.date,
        start,
        dur,
        (other) =>
          Array.isArray(other.driverIds) && other.driverIds.includes(resourceId)
      );
      if (busy) {
        alert(
          `Driver "${driver.name || driver.id}" is already busy on ${
            job.date
          } at ${start} for ${dur}h.`
        );
        return;
      }

      if (exceedsDriverLimitForTractor(state, job, resourceId)) {
        alert("This tractor does not allow more drivers for this job.");
        return;
      }

      const currentDrivers = Array.isArray(job.driverIds) ? job.driverIds : [];
      const already = currentDrivers.includes(resourceId);
      const candidate = {
        ...job,
        driverIds: already
          ? currentDrivers.filter((id) => id !== resourceId)
          : [...currentDrivers, resourceId],
      };

      const check = validateWholeJob(state, candidate, job.id);
      if (!check.ok) {
        alert(check.reason);
        return;
      }

      const next = {
        ...state,
        jobs: (state.jobs || []).map((j) => (j.id === job.id ? candidate : j)),
      };
      persistIfAdmin(next);
      return;
    }

    if (resourceType === "tractor") {
      const numericId = !Number.isNaN(Number(resourceId))
        ? Number(resourceId)
        : resourceId;

      const busy = isResourceBusy(
        state,
        job.id,
        job.date,
        start,
        dur,
        (other) => String(other.tractorId) === String(numericId)
      );
      if (busy) {
        alert("This tractor is already assigned at that time.");
        return;
      }
      const candidate = {
        ...job,
        tractorId: String(job.tractorId) === String(numericId) ? "" : numericId,
      };

      const check = validateWholeJob(state, candidate, job.id);
      if (!check.ok) {
        alert(check.reason);
        return;
      }

      const next = {
        ...state,
        jobs: (state.jobs || []).map((j) => (j.id === job.id ? candidate : j)),
      };
      persistIfAdmin(next);
      return;
    }

    if (resourceType === "trailer") {
      const busy = isResourceBusy(
        state,
        job.id,
        job.date,
        start,
        dur,
        (other) => String(other.trailerId) === String(resourceId)
      );
      if (busy) {
        alert("This trailer is already assigned at that time.");
        return;
      }

      const candidate = {
        ...job,
        trailerId:
          String(job.trailerId) === String(resourceId) ? "" : resourceId,
      };

      const check = validateWholeJob(state, candidate, job.id);
      if (!check.ok) {
        alert(check.reason);
        return;
      }

      const next = {
        ...state,
        jobs: (state.jobs || []).map((j) => (j.id === job.id ? candidate : j)),
      };
      persistIfAdmin(next);
      return;
    }
  }

  function tryCreateJobWithResource(date, slot, resourceType, resourceId) {
    if (!isAdmin) return;
    if (!state) return;

    const newId = `job-${crypto.randomUUID()}`;
    const startGuess = defaultStartForSlot(slot);

    let newJob = {
      id: newId,
      date,
      slot,
      start: startGuess,
      durationHours: 8,
      client: "New Client",
      pickup: "",
      dropoff: "",
      tractorId: "",
      trailerId: "",
      driverIds: [],
      pricing: { type: "per_km", value: 1.4 },
      notes: "",
    };

    const dur = newJob.durationHours;

    if (resourceType === "driver") {
      const driver = (state.drivers || []).find((d) => d.id === resourceId);
      const blockReason = getDriverBlockReason(driver || {}, newJob);
      if (blockReason && blockReason !== "driver-missing") {
        alert(blockReason);
        return;
      }

      const busy = isResourceBusy(
        state,
        newJob.id,
        newJob.date,
        newJob.start,
        dur,
        (other) =>
          Array.isArray(other.driverIds) && other.driverIds.includes(resourceId)
      );
      if (busy) {
        alert(
          `Driver "${
            driver?.name || driver?.id || resourceId
          }" is already busy on ${newJob.date} at ${
            newJob.start
          } for ${dur}h. Job not created.`
        );
        return;
      }
      newJob.driverIds = [resourceId];
    }

    if (resourceType === "tractor") {
      const numericId = !Number.isNaN(Number(resourceId))
        ? Number(resourceId)
        : resourceId;
      const busy = isResourceBusy(
        state,
        newJob.id,
        newJob.date,
        newJob.start,
        dur,
        (other) => String(other.tractorId) === String(numericId)
      );
      if (busy) {
        alert("Tractor already busy in that time range. Job not created.");
        return;
      }
      newJob.tractorId = numericId;
    }

    if (resourceType === "trailer") {
      const busy = isResourceBusy(
        state,
        newJob.id,
        newJob.date,
        newJob.start,
        dur,
        (other) => String(other.trailerId) === String(resourceId)
      );
      if (busy) {
        alert("Trailer already busy in that time range. Job not created.");
        return;
      }
      newJob.trailerId = resourceId;
    }

    const check = validateWholeJob(state, newJob, newJob.id);
    if (!check.ok) {
      alert(check.reason);
      return;
    }

    persistIfAdmin({
      ...state,
      jobs: [...state.jobs, newJob],
    });
  }

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    if (!state) return;
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const isResource = activeIdStr.startsWith("resource-");
    const isJobCard = activeIdStr.startsWith("job-");

    if (isJobCard && overIdStr.startsWith("slot|")) {
      if (!isAdmin) return;
      const [, dropDate, dropSlot] = overIdStr.split("|");
      const jobId = activeIdStr;
      moveJobToSlotValidated(jobId, dropDate, dropSlot);
      return;
    }

    if (isResource) {
      const parts = activeIdStr.split("-");
      const resourceType = parts[1];
      const resourceRealId = parts.slice(2).join("-");

      if (overIdStr.startsWith("job-")) {
        const jobId = overIdStr;
        const job = getJobById(jobId);
        if (!job) return;
        assignResourceToJob(job, resourceType, resourceRealId);
        return;
      }

      if (overIdStr.startsWith("slot|")) {
        const [, dropDate, dropSlot] = overIdStr.split("|");
        tryCreateJobWithResource(
          dropDate,
          dropSlot,
          resourceType,
          resourceRealId
        );
        return;
      }
    }
  }

  const currentWeekStart = state?.weekStart
    ? new Date(state.weekStart)
    : getStartOfWeek(new Date());

  function goPrevWeek() {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    if (isAdmin) {
      persistIfAdmin({ ...state, weekStart: prev.toISOString().slice(0, 10) });
    } else {
      setState({ ...state, weekStart: prev.toISOString().slice(0, 10) });
    }
  }

  function goNextWeek() {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    if (isAdmin) {
      persistIfAdmin({ ...state, weekStart: next.toISOString().slice(0, 10) });
    } else {
      setState({ ...state, weekStart: next.toISOString().slice(0, 10) });
    }
  }

  function filteredResources(list, type) {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return list || [];
    if (type === "tractor") {
      return (list || []).filter(
        (t) =>
          (t.code || "").toLowerCase().includes(q) ||
          (t.plate || "").toLowerCase().includes(q)
      );
    }
    if (type === "trailer") {
      return (list || []).filter(
        (t) =>
          (t.code || "").toLowerCase().includes(q) ||
          (t.type || "").toLowerCase().includes(q)
      );
    }
    if (type === "driver") {
      return (list || []).filter(
        (d) =>
          (d.name || "").toLowerCase().includes(q) ||
          (d.code || "").toLowerCase().includes(q)
      );
    }
    return list || [];
  }

  if (loading) {
    return (
      <div className="p-6 text-gray-500 text-sm animate-pulse">
        Loading planner...
      </div>
    );
  }
  if (!state) {
    return <div className="p-6 text-red-600 text-sm">Failed to load.</div>;
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 bg-gray-50 min-h-screen relative">
      {/* SAVING OVERLAY */}
      {saving && (
        <div className="fixed inset-0 z-[999] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-sm text-gray-700 font-medium">
            Saving planner changes...
          </p>
          <p className="text-xs text-gray-400">
            Please wait until the request finishes.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex flex-row gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={goPrevWeek}
                className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
                <Calendar size={16} className="text-gray-500" />
                <span>
                  Week of{" "}
                  {currentWeekStart.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <button
                onClick={goNextWeek}
                className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="relative max-w-xs">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search drivers / tractors / trailers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-row gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterTractor}
                onChange={(e) => setFilterTractor(e.target.value)}
                className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Tractors</option>
                {(state.tractors || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code || t.plate || t.id}
                  </option>
                ))}
              </select>

              <select
                value={filterTrailer}
                onChange={(e) => setFilterTrailer(e.target.value)}
                className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Trailers</option>
                {(state.trailers || []).map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.code || tr.id}
                  </option>
                ))}
              </select>

              <select
                value={filterDriver}
                onChange={(e) => setFilterDriver(e.target.value)}
                className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Drivers</option>
                {(state.drivers || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.code || d.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isAdmin ? (
                <button
                  onClick={() => setShowDistanceEditor(true)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
                >
                  <MapPin size={18} /> Distances
                </button>
              ) : (
                <div className="text-[11px] text-gray-500 bg-gray-100 rounded-lg px-3 py-2 border border-gray-200">
                  Read Only
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="w-full xl:w-[240px] flex-shrink-0 flex flex-col gap-4">
            <div className="sticky top-0 left-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-scroll h-[100vh] pt-2 pb-4 flex flex-col gap-4">
              <ResourcePool
                title="Tractors"
                icon={Truck}
                resources={filteredResources(state.tractors || [], "tractor")}
                type="tractor"
                jobs={state.jobs || []}
              />
              <ResourcePool
                title="Trailers"
                icon={Package}
                resources={filteredResources(state.trailers || [], "trailer")}
                type="trailer"
                jobs={state.jobs || []}
              />
              <ResourcePool
                title="Drivers"
                icon={Users}
                resources={filteredResources(state.drivers || [], "driver")}
                type="driver"
                jobs={state.jobs || []}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <WeekView
              state={state}
              onAddJob={addNewJob}
              onUpdateJob={updateJob}
              onDeleteJob={deleteJob}
              onOpenJob={openJobModal}
              isAdmin={isAdmin}
              filterTractor={filterTractor}
              filterTrailer={filterTrailer}
              filterDriver={filterDriver}
            />
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-50 bg-blue-100 border-2 border-blue-500 text-blue-800 text-xs px-2 py-1 rounded shadow">
              Dragging...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showDistanceEditor && (
        <DistanceEditor
          state={state}
          onUpdate={(next) => {
            if (!isAdmin) {
              alert("Only admin can edit distances");
              return;
            }
            persistIfAdmin(next);
            setShowDistanceEditor(false);
          }}
          onClose={() => setShowDistanceEditor(false)}
        />
      )}

      {selectedJob && (
        <JobModal
          job={selectedJob}
          drivers={state.drivers || []}
          tractors={state.tractors || []}
          trailers={state.trailers || []}
          locations={state.locations || []}
          isAdmin={isAdmin}
          onClose={closeJobModal}
          onSave={(updates) => {
            updateJob(selectedJob.id, updates);
            closeJobModal();
          }}
          onDelete={() => {
            deleteJob(selectedJob.id);
            closeJobModal();
          }}
        />
      )}
    </div>
  );
}
