import React, { useState, useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
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
import JobModal from "./JobModal";
import { Truck, Users, Package, Calendar, MapPin, Search } from "lucide-react";
import { apiGetState, apiSaveState } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import ResourcePool from "./ResourcePool";
import DistanceEditor from "./DistanceEditor";
import DayTimelineView from "./DayTimelineView";

/* ===== Helpers ===== */
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
function slotDurationHours(slotKey) {
  return slotKey === "flex" ? 8 : 4;
}
function inferWeekSlotFromSlotKey(slotKey) {
  if (["20-24", "00-04", "04-08"].includes(slotKey)) return "night";
  return "day";
}
function startTimeFromSlotKey(slotKey) {
  const map = {
    "00-04": "00:00",
    "04-08": "04:00",
    "08-12": "08:00",
    "12-16": "12:00",
    "16-20": "16:00",
    "20-24": "20:00",
    flex: "08:00",
  };
  return map[slotKey] || "08:00";
}

/* ==== resolve legacy short IDs → real UUIDs ==== */
function resolveResourceId(maybeId, list) {
  if (!maybeId) return "";
  if (!Array.isArray(list)) return maybeId;

  // exact
  const exact = list.find((r) => r.id === maybeId);
  if (exact) return maybeId;

  // legacy prefix
  const byPrefix = list.find(
    (r) => typeof r.id === "string" && r.id.startsWith(String(maybeId))
  );
  if (byPrefix) return byPrefix.id;

  // match by code
  const byCode = list.find((r) => r.code && r.code === maybeId);
  if (byCode) return byCode.id;

  return maybeId;
}

/* normalize job from API */
function normalizeJobFromApi(job, drivers = [], tractors = [], trailers = []) {
  const hour = parseInt((job.start || "0").split(":")[0], 10);
  const normalizedSlot = job.slot
    ? job.slot
    : hour >= 20 || hour < 8
    ? "night"
    : "day";

  const fixedTractorId = resolveResourceId(job.tractorId ?? "", tractors);
  const fixedTrailerId = resolveResourceId(job.trailerId ?? "", trailers);
  const fixedDriverIds = Array.isArray(job.driverIds)
    ? job.driverIds.map((id) => resolveResourceId(id, drivers))
    : [];

  return {
    ...job,
    slot: normalizedSlot,
    tractorId: fixedTractorId ?? "",
    trailerId: fixedTrailerId ?? "",
    driverIds: fixedDriverIds,
  };
}

function normalizeStateFromApi(apiState) {
  if (!apiState || !Array.isArray(apiState.jobs)) return apiState;

  const drivers = Array.isArray(apiState.drivers) ? apiState.drivers : [];
  const tractors = Array.isArray(apiState.tractors) ? apiState.tractors : [];
  const trailers = Array.isArray(apiState.trailers) ? apiState.trailers : [];
  const locations = Array.isArray(apiState.locations) ? apiState.locations : [];

  return {
    ...apiState,
    jobs: apiState.jobs.map((job) =>
      normalizeJobFromApi(job, drivers, tractors, trailers)
    ),
    drivers,
    tractors,
    trailers,
    locations,
  };
}

/* ===== driver availability (موحّد مع Planner) ===== */
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

function normalizeWeekAvailability(wa) {
  if (wa === null || wa === undefined) return null; // يعني متاح كل الأيام
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
  if (list === null) return true; // غير معرّفة → متاح كل الأيام
  if (Array.isArray(list) && list.length === 0) return false; // مصفوفة فاضية → غير متاح إطلاقًا
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

/* ==== fixed blocks ==== */
const FIXED_BLOCK_STARTS = [
  "00:00",
  "04:00",
  "08:00",
  "12:00",
  "16:00",
  "20:00",
];

function isFixed4hBlock(job) {
  return FIXED_BLOCK_STARTS.includes(job.start);
}

function getEffectiveDurationHours(job) {
  if (!isFixed4hBlock(job)) {
    return job.durationHours || 0;
  }
  const real = job.durationHours || 0;
  return real > 4 ? 4 : real;
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

/* ===== validator (يرفض السائق لو في إجازة / مش شغّال اليوم) ===== */
function validateWholeJob(state, candidateJob, originalJobId) {
  if (isFixed4hBlock(candidateJob) && (candidateJob.durationHours || 0) > 4) {
    return {
      ok: false,
      reason:
        "In Day Planner each time block is 4 hours (e.g. 08:00–12:00). You entered a job longer than 4h. Either set duration to 4h or create another job in the next block.",
    };
  }

  const start = candidateJob.start || "08:00";
  const dur = getEffectiveDurationHours(candidateJob);

  // drivers
  if (Array.isArray(candidateJob.driverIds)) {
    for (const dId of candidateJob.driverIds) {
      const driver = (state.drivers || []).find((d) => d.id === dId);

      // ✅ المنع الصريح لو إجازة / مش شغّال اليوم / ممنوع ليل
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

/* ========== normalize before sending to backend ========== */
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

/* ===== component ===== */
export default function DayPlanner() {
  const { date } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDistanceEditor, setShowDistanceEditor] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const fixedState = normalizeStateFromApi(apiState);
        setState(fixedState);
      } catch (e) {
        console.error("failed to load day planner state", e);
        setState(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  async function persistIfAdmin(nextState) {
    setState(nextState);
    if (isAdmin) {
      setSaving(true);
      try {
        const safe = normalizeStateForBackend(nextState);
        await apiSaveState(safe);
      } catch (e) {
        console.error("failed saving day planner state", e);
      } finally {
        setSaving(false);
      }
    }
  }

  const openJobModal = (jobId) => setActiveJobId(jobId);
  const closeJobModal = () => setActiveJobId(null);

  const updateJob = (jobId, updates) => {
    if (!state || !isAdmin) return;
    const oldJob = state.jobs.find((j) => j.id === jobId);
    if (!oldJob) return;

    const candidate = normalizeJobFromApi(
      { ...oldJob, ...updates },
      state.drivers,
      state.tractors,
      state.trailers
    );

    const check = validateWholeJob(state, candidate, jobId);
    if (!check.ok) {
      alert(check.reason);
      return;
    }

    const newJobs = state.jobs.map((job) =>
      job.id === jobId ? candidate : job
    );
    persistIfAdmin({ ...state, jobs: newJobs });
  };

  const deleteJob = (jobId) => {
    if (!state || !isAdmin) return;
    persistIfAdmin({
      ...state,
      jobs: state.jobs.filter((job) => job.id !== jobId),
    });
  };

  const addNewJobAtSlot = (theDate, slotKey) => {
    if (!state || !isAdmin) return;
    const newJob = {
      id: `job-${crypto.randomUUID()}`,
      date: theDate,
      start: startTimeFromSlotKey(slotKey),
      slot: inferWeekSlotFromSlotKey(slotKey),
      client: "New Client",
      pickup: "",
      dropoff: "",
      durationHours: slotDurationHours(slotKey),
      pricing: { type: "per_km", value: 1.4 },
      driverIds: [],
      tractorId: "",
      trailerId: "",
      notes: "",
    };
    const check = validateWholeJob(state, newJob, newJob.id);
    if (!check.ok) {
      alert(check.reason);
      return;
    }
    persistIfAdmin({ ...state, jobs: [...state.jobs, newJob] });
  };

  function getJobById(jobId) {
    return (state.jobs || []).find((j) => j.id === jobId);
  }

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    if (!state) return;
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    if (!isAdmin) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const isResource = activeIdStr.startsWith("resource-");

    // helper to parse resource id safely (no split on "-")
    const getResourceInfo = (idStr) => {
      if (idStr.startsWith("resource-driver-")) {
        return {
          type: "driver",
          id: idStr.slice("resource-driver-".length),
        };
      }
      if (idStr.startsWith("resource-tractor-")) {
        return {
          type: "tractor",
          id: idStr.slice("resource-tractor-".length),
        };
      }
      if (idStr.startsWith("resource-trailer-")) {
        return {
          type: "trailer",
          id: idStr.slice("resource-trailer-".length),
        };
      }
      return { type: null, id: null };
    };

    // drop on existing job
    if (isResource && overIdStr.startsWith("job-")) {
      const { type: resourceType, id: resourceRealId } =
        getResourceInfo(activeIdStr);
      const job = getJobById(overIdStr);
      if (!job || !resourceType || !resourceRealId) return;

      let candidate = { ...job };

      if (resourceType === "driver") {
        const current = Array.isArray(job.driverIds) ? job.driverIds : [];
        const already = current.includes(resourceRealId);
        candidate = {
          ...candidate,
          driverIds: already
            ? current.filter((id) => id !== resourceRealId)
            : [...current, resourceRealId],
        };
      } else if (resourceType === "tractor") {
        candidate = {
          ...candidate,
          tractorId:
            String(candidate.tractorId) === String(resourceRealId)
              ? ""
              : resourceRealId,
        };
      } else if (resourceType === "trailer") {
        candidate = {
          ...candidate,
          trailerId:
            String(candidate.trailerId) === String(resourceRealId)
              ? ""
              : resourceRealId,
        };
      }

      const check = validateWholeJob(state, candidate, job.id);
      if (!check.ok) {
        alert(check.reason);
        return;
      }

      updateJob(job.id, candidate);
      return;
    }

    // drop on empty slot → create job
    if (isResource && overIdStr.startsWith("time|")) {
      const [, dropDate, slotKey] = overIdStr.split("|");
      const { type: resourceType, id: resourceRealId } =
        getResourceInfo(activeIdStr);
      if (!resourceType || !resourceRealId) return;

      let baseJob = {
        id: `job-${crypto.randomUUID()}`,
        date: dropDate,
        start: startTimeFromSlotKey(slotKey),
        slot: inferWeekSlotFromSlotKey(slotKey),
        client: "New Client",
        pickup: "",
        dropoff: "",
        durationHours: slotDurationHours(slotKey),
        pricing: { type: "per_km", value: 1.4 },
        driverIds: [],
        tractorId: "",
        trailerId: "",
        notes: "",
      };

      if (resourceType === "driver") {
        baseJob.driverIds = [resourceRealId];
      } else if (resourceType === "tractor") {
        baseJob.tractorId = resourceRealId;
      } else if (resourceType === "trailer") {
        baseJob.trailerId = resourceRealId;
      }

      const check = validateWholeJob(state, baseJob, baseJob.id);
      if (!check.ok) {
        alert(check.reason);
        return;
      }

      persistIfAdmin({ ...state, jobs: [...state.jobs, baseJob] });
    }
  };

  const filteredResources = (resources, type) =>
    (resources || []).filter((resource) => {
      const searchString =
        type === "driver"
          ? resource.name?.toLowerCase?.() || ""
          : resource.code?.toLowerCase?.() ||
            resource.plate?.toLowerCase?.() ||
            "";
      return searchString.includes(searchTerm.toLowerCase());
    });

  const dateReadable = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (loading || !state) {
    return (
      <div className="p-6 text-gray-600">
        {loading ? "Loading day planner data..." : "No data."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {saving && (
        <div className="fixed inset-0 z-[999] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <p className="text-sm text-gray-700 font-medium">Saving changes...</p>
          <p className="text-xs text-gray-400">
            Please wait until the request finishes.
          </p>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-600" />
              <span className="font-semibold text-gray-900">
                {dateReadable}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <button
                  onClick={() => setShowDistanceEditor(true)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300 text-sm"
                >
                  <MapPin size={18} /> Distances
                </button>
              ) : (
                <div className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2 border border-gray-200">
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
        <div className="max-w-[1800px] mx-auto p-6">
          <div
            className={` ${isAdmin ? "flex flex-col xl:flex-row gap-4" : ""}`}
          >
            {isAdmin && (
              <div className="w-full xl:w-[240px] flex-shrink-0 flex flex-col gap-4">
                <div className="xl:col-span-1 space-y-6 sticky top-0 left-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-scroll h-[100vh]">
                  <div className="card p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                        size={18}
                      />
                      <input
                        type="text"
                        placeholder="Search resources..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  {/* ✅ نمرر lockDateISO لعرض أيقونة المنع على السواقين في يوم الإجازة */}
                  <ResourcePool
                    title="Tractors"
                    icon={Truck}
                    resources={filteredResources(state.tractors, "tractor")}
                    type="tractor"
                    jobs={state.jobs}
                  />
                  <ResourcePool
                    title="Trailers"
                    icon={Package}
                    resources={filteredResources(state.trailers, "trailer")}
                    type="trailer"
                    jobs={state.jobs}
                  />
                  <ResourcePool
                    title="Drivers"
                    icon={Users}
                    resources={filteredResources(state.drivers, "driver")}
                    type="driver"
                    jobs={state.jobs}
                    lockDateISO={date}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <DayTimelineView
                date={date}
                state={state}
                isAdmin={isAdmin}
                onAddJobSlot={addNewJobAtSlot}
                onUpdateJob={updateJob}
                onDeleteJob={deleteJob}
                onOpenJob={openJobModal}
              />
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-50 bg-blue-100 border-2 border-blue-500 rounded-lg p-4">
              Dragging: {activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {isAdmin && showDistanceEditor && (
        <DistanceEditor
          state={state}
          onUpdate={(next) => persistIfAdmin(next)}
          onClose={() => setShowDistanceEditor(false)}
        />
      )}

      {activeJobId && (
        <JobModal
          job={state.jobs.find((j) => j.id === activeJobId)}
          drivers={state.drivers || []}
          tractors={state.tractors || []}
          trailers={state.trailers || []}
          locations={state.locations || []}
          isAdmin={isAdmin}
          onClose={closeJobModal}
          onSave={(updates) => {
            updateJob(activeJobId, updates);
            closeJobModal();
          }}
          onDelete={() => {
            deleteJob(activeJobId);
            closeJobModal();
          }}
        />
      )}
    </div>
  );
}
