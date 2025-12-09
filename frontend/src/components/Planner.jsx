// src/components/Planner.jsx
import React, { useState, useEffect } from "react";
import { validateWholeJob } from "../lib/jobValidation";
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

/* ===== Helpers (محلية) ===== */
function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function getStartOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0..6
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDaysFromISO(weekStartISO) {
  const base = new Date(weekStartISO);
  base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return h * 60 + (m || 0);
}

function defaultStartForSlot(slot) {
  return slot === "night" ? "20:00" : "08:00";
}
function shortIso(x) {
  return String(x || "").slice(0, 10);
}

/**
 * احسب وقت نهاية الجوب في صورة Date
 */
function buildJobEndDate(dateISO, start, durationHours) {
  if (!dateISO) return null;
  const parts = String(dateISO).split("-");
  if (parts.length < 3) return null;
  const [yStr, mStr, dStr] = parts;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  if (!y || !m || !d) return null;

  const [hhStr, mmStr] = String(start || "00:00").split(":");
  const hh = parseInt(hhStr || "0", 10);
  const mm = parseInt(mmStr || "0", 10);

  const base = new Date();
  base.setFullYear(y);
  base.setMonth(m - 1);
  base.setDate(d);
  base.setHours(hh, mm || 0, 0, 0);

  const durMs = (durationHours || 0) * 60 * 60 * 1000;
  return new Date(base.getTime() + durMs);
}

/**
 * true لو الجوب كله في الماضي (نهاية المدة أقل من الوقت الحالي)
 */
// الماضي الجميل
// رجع ممنوع التعديل في الماضي
// end.getTime() <= Date.now();
function isJobCompletelyInPast(dateISO, start, durationHours) {
  const end = buildJobEndDate(dateISO, start, durationHours);
  if (!end) return false;
  // حسب الكود الحالي عندك مخليها دايمًا false
  return false;
}

/* ===== بناء حالة آمنة من الـ API ===== */
function normalizeJobSlot(job) {
  if (job.slot === "day" || job.slot === "night") return job;
  const hour = parseInt((job.start || "0").split(":")[0], 10);
  const normalizedSlot = hour >= 20 || hour < 8 ? "night" : "day";
  return { ...job, slot: normalizedSlot };
}

function buildSafeState(raw) {
  const src = raw || {};

  const jobs = Array.isArray(src.jobs) ? src.jobs.map(normalizeJobSlot) : [];

  const drivers = Array.isArray(src.drivers)
    ? src.drivers.map((d) => ({
        ...d,
        rating: Number.isFinite(Number(d?.rating)) ? Number(d.rating) : 0,
      }))
    : [];

  const tractors = Array.isArray(src.tractors) ? src.tractors : [];
  const trailers = Array.isArray(src.trailers) ? src.trailers : [];
  const locations = Array.isArray(src.locations) ? src.locations : [];

  const distanceKm =
    typeof src.distanceKm === "object" && src.distanceKm !== null
      ? src.distanceKm
      : {};

  const settings =
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
          trailerDayCost: { reefer: 35, box: 20, taut: 18, chassis: 15 },
        };

  const weekStart = src.weekStart || toISODateLocal(new Date());

  // 👈 نحافظ على أي فيلدات إضافية جاية من السيرفر (زي version)
  return {
    ...src,
    jobs,
    drivers,
    tractors,
    trailers,
    locations,
    distanceKm,
    settings,
    weekStart,
  };
}

/* ========== normalize قبل الإرسال للباك إند (نفس فكرة DayPlanner) ========== */
function toBackendLocation(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val.name || val.id || "";
}

function normalizeStateForBackend(state) {
  const normJobs = (state.jobs || []).map((job) => {
    const j = { ...job };

    j.pickup = toBackendLocation(j.pickup);
    j.dropoff = toBackendLocation(j.dropoff);

    if (j.tractorId === "" || j.tractorId === undefined) {
      j.tractorId = null;
    }
    if (j.trailerId === "" || j.trailerId === undefined) {
      j.trailerId = null;
    }

    return j;
  });

  return {
    ...state,
    jobs: normJobs,
    drivers: Array.isArray(state.drivers) ? state.drivers : [],
    tractors: Array.isArray(state.tractors) ? state.tractors : [],
    trailers: Array.isArray(state.trailers) ? state.trailers : [],
    locations: Array.isArray(state.locations) ? state.locations : [],
  };
}

export default function Planner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDistanceEditor, setShowDistanceEditor] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTractor, setFilterTractor] = useState("");
  const [filterTrailer, setFilterTrailer] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  // NEW: Preview day (عشان نظهر lock للسائقين في قائمة الموارد)
  const [previewDateISO, setPreviewDateISO] = useState("");

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
        // default preview = أول يوم في الأسبوع الحالي
        const weekDays = getWeekDaysFromISO(safe.weekStart);
        setPreviewDateISO(toISODateLocal(weekDays[0]));
      } catch (e) {
        console.error("failed to load planner state", e);
        setState(buildSafeState(null));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ✅ هنا التعديل المهم: نستخدم state الراجعة من السيرفر عشان version ما يفضلش قديم
  async function persistIfAdmin(nextState) {
    const safe = buildSafeState(nextState);
    setState(safe); // optimistic UI update

    if (!isAdmin) return;

    setSaving(true);
    try {
      const backendSafe = normalizeStateForBackend(safe);
      const saved = await apiSaveState(backendSafe);
      const merged = buildSafeState(saved || safe);
      setState(merged); // نحمل الـ version الجديدة من السيرفر
    } catch (e) {
      console.error("failed saving planner state", e);
      if (e?.code === "STATE_VERSION_CONFLICT" || e?.status === 409) {
        alert(
          "Data was updated by another admin / browser tab.\nYour last weekly planner change was NOT saved.\nPlease reload the planner before editing again."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function rangesOverlap(startA, durA, startB, durB) {
    const a1 = timeToMinutes(startA);
    const a2 = a1 + (durA || 0) * 60;
    const b1 = timeToMinutes(startB);
    const b2 = b1 + (durB || 0) * 60;
    return Math.max(a1, b1) < Math.min(a2, b2);
  }

  function isResourceBusy(
    stateObj,
    excludeJobId,
    dateISO,
    start,
    dur,
    predicateFn
  ) {
    return (stateObj.jobs || []).some((other) => {
      if (other.id === excludeJobId) return false;
      if (shortIso(other.date) !== shortIso(dateISO)) return false;
      return (
        predicateFn(other) &&
        rangesOverlap(start, dur, other.start, other.durationHours)
      );
    });
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
      return;
    }
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

    if (
      isJobCompletelyInPast(
        newJob.date,
        newJob.start,
        newJob.durationHours || 0
      )
    ) {
      alert("You cannot add a job completely in the past.");
      return;
    }

    const check = validateWholeJob(state, newJob, newJob.id);
    if (!check.ok) {
      alert(check.reason);
      return;
    }
    persistIfAdmin({
      ...state,
      jobs: [...(state.jobs || []), newJob],
    });
  }

  function updateJob(jobId, updates) {
    const oldJob = (state.jobs || []).find((j) => j.id === jobId);
    if (!oldJob) return;

    const candidate = { ...oldJob, ...updates };

    const wasPast = isJobCompletelyInPast(
      oldJob.date,
      oldJob.start || defaultStartForSlot(oldJob.slot),
      oldJob.durationHours || 0
    );
    const willBePast = isJobCompletelyInPast(
      candidate.date,
      candidate.start || defaultStartForSlot(candidate.slot),
      candidate.durationHours || 0
    );
    if (!wasPast && willBePast) {
      alert("You cannot move a job completely into the past.");
      return;
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

    const wasPast = isJobCompletelyInPast(
      job.date,
      job.start || defaultStartForSlot(job.slot),
      job.durationHours || 0
    );
    const willBePast = isJobCompletelyInPast(
      proposed.date,
      proposed.start,
      proposed.durationHours || 0
    );
    if (!wasPast && willBePast) {
      alert("You cannot move a job completely into the past.");
      return;
    }

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
      const driver = (state.drivers || []).find(
        (d) => String(d.id) === String(resourceId)
      );
      if (!driver) return;

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
          `Driver "${driver.name || driver.id}" is already busy on ${shortIso(
            job.date
          )} at ${start} for ${dur}h.`
        );
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
      const driver = (state.drivers || []).find(
        (d) => String(d.id) === String(resourceId)
      );
      if (!driver) return;

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
          }" is already busy on ${shortIso(newJob.date)} at ${
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

    if (
      isJobCompletelyInPast(
        newJob.date,
        newJob.start,
        newJob.durationHours || 0
      )
    ) {
      alert("You cannot add a job completely in the past.");
      return;
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
      const getRes = (id) => {
        if (id.startsWith("resource-driver-"))
          return { type: "driver", id: id.slice("resource-driver-".length) };
        if (id.startsWith("resource-tractor-"))
          return { type: "tractor", id: id.slice("resource-tractor-".length) };
        if (id.startsWith("resource-trailer-"))
          return { type: "trailer", id: id.slice("resource-trailer-".length) };
        return { type: null, id: null };
      };
      const { type: resourceType, id: resourceRealId } = getRes(activeIdStr);

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

  const currentWeekStart = state.weekStart
    ? new Date(state.weekStart)
    : getStartOfWeekMonday(new Date());
  const weekDays = getWeekDaysFromISO(toISODateLocal(currentWeekStart));

  function goPrevWeek() {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    const iso = toISODateLocal(prev);
    if (isAdmin) {
      persistIfAdmin({ ...state, weekStart: iso });
    } else {
      setState({ ...state, weekStart: iso });
    }
    const days = getWeekDaysFromISO(iso);
    setPreviewDateISO(toISODateLocal(days[0]));
  }

  function goNextWeek() {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    const iso = toISODateLocal(next);
    if (isAdmin) {
      persistIfAdmin({ ...state, weekStart: iso });
    } else {
      setState({ ...state, weekStart: iso });
    }
    const days = getWeekDaysFromISO(iso);
    setPreviewDateISO(toISODateLocal(days[0]));
  }

  function filteredResources(list, type) {
    const q = searchTerm.toLowerCase().trim();
    let arr = list || [];

    if (q) {
      if (type === "tractor") {
        arr = arr.filter(
          (t) =>
            (t.code || "").toLowerCase().includes(q) ||
            (t.plate || "").toLowerCase().includes(q)
        );
      } else if (type === "trailer") {
        arr = arr.filter(
          (t) =>
            (t.code || "").toLowerCase().includes(q) ||
            (t.type || "").toLowerCase().includes(q)
        );
      } else if (type === "driver") {
        arr = arr.filter(
          (d) =>
            (d.name || "").toLowerCase().includes(q) ||
            (d.code || "").toLowerCase().includes(q)
        );
      }
    }

    if (type === "driver") {
      arr = [...arr].sort((a, b) => {
        const ra = Number.isFinite(Number(a?.rating)) ? Number(a.rating) : 0;
        const rb = Number.isFinite(Number(b?.rating)) ? Number(b.rating) : 0;
        if (rb !== ra) return rb - ra;
        const na = (a.name || a.code || "").toLowerCase();
        const nb = (b.name || b.code || "").toLowerCase();
        return na.localeCompare(nb);
      });
    }

    return arr;
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
                  Week starting{" "}
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

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col xl:flex-row gap-4">
          {isAdmin && (
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
                {/* ✅ نمرّر previewDateISO كـ lockDateISO لعرض القفل على السائقين في اليوم المختار */}
                <ResourcePool
                  title="Drivers"
                  icon={Users}
                  resources={filteredResources(state.drivers || [], "driver")}
                  type="driver"
                  jobs={state.jobs || []}
                  lockDateISO={previewDateISO}
                />
              </div>
            </div>
          )}
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
          allJobs={state.jobs || []}
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
