// src/components/DayPlanner.jsx
import React, { useState, useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
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

function minutesToTime(mins) {
  const total = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  return `${pad(h)}:${pad(m)}`;
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

/* ========== normalize قبل الإرسال للباك إند ========== */
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
// end.getTime() <= Date.now();
function isJobCompletelyInPast(dateISO, start, durationHours) {
  const end = buildJobEndDate(dateISO, start, durationHours);
  if (!end) return false;
  return false;
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
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  // ✅ إعدادات مودال النسخ
  const [duplicateJobConfig, setDuplicateJobConfig] = useState(null);
  // duplicateJobConfig: { jobId, date, start, durationHours }

  const openJobModal = (jobId) => {
    setActiveJobId(jobId);
    setIsJobModalOpen(true);
  };

  const closeJobModal = () => {
    setIsJobModalOpen(false);
    setActiveJobId(null);
  };

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
        setIsJobModalOpen(false);
        setActiveJobId(null);
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

    const wasPast = isJobCompletelyInPast(
      oldJob.date,
      oldJob.start || "00:00",
      oldJob.durationHours || 0
    );
    const willBePast = isJobCompletelyInPast(
      candidate.date,
      candidate.start || "00:00",
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

  // ✅ فتح مودال النسخ مع default values
  const startDuplicateJob = (jobId) => {
    if (!state || !isAdmin) return;
    const original = (state.jobs || []).find((j) => j.id === jobId);
    if (!original) return;

    setDuplicateJobConfig({
      jobId,
      date: original.date,
      start: original.start || "08:00",
      durationHours: original.durationHours || 4,
    });
  };

  // ✅ تأكيد النسخ بعد إدخال البيانات في المودال
  const confirmDuplicateJob = () => {
    if (!state || !isAdmin || !duplicateJobConfig) return;
    const original = (state.jobs || []).find(
      (j) => j.id === duplicateJobConfig.jobId
    );
    if (!original) {
      setDuplicateJobConfig(null);
      return;
    }

    const newDate = duplicateJobConfig.date || original.date;
    const newStart = duplicateJobConfig.start || original.start || "08:00";
    const newDuration = Number(duplicateJobConfig.durationHours || 0) || 0;

    const copy = {
      ...original,
      id: `job-${crypto.randomUUID()}`,
      date: newDate,
      start: newStart,
      durationHours: newDuration,
    };

    // نضبط الـ slot حسب الوقت الجديد (day / night)
    const hour = parseInt((newStart || "0").split(":")[0], 10);
    copy.slot = hour >= 20 || hour < 8 ? "night" : "day";

    // ⛔ منع إنشاء نسخة كلها في الماضي
    if (isJobCompletelyInPast(copy.date, copy.start, copy.durationHours || 0)) {
      alert("You cannot create a duplicated job completely in the past.");
      return;
    }

    // مهم: هنا مش بنستبعد الجوب الأصلي من الفاليديشن
    const check = validateWholeJob(state, copy, null);
    if (!check.ok) {
      alert(check.reason);
      return;
    }

    persistIfAdmin({ ...state, jobs: [...state.jobs, copy] });
    setDuplicateJobConfig(null);
  };

  const cancelDuplicateJob = () => setDuplicateJobConfig(null);

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

    // ⛔ منع إضافة جوب كله في الماضي
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

      // ⛔ منع إنشاء جوب كله في الماضي
      if (
        isJobCompletelyInPast(
          baseJob.date,
          baseJob.start,
          baseJob.durationHours || 0
        )
      ) {
        alert("You cannot add a job completely in the past.");
        return;
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

  let duplicateEndTime = "";
  if (duplicateJobConfig && duplicateJobConfig.start) {
    const startM = timeToMinutes(duplicateJobConfig.start);
    const durM = Number(duplicateJobConfig.durationHours || 0) * 60;
    duplicateEndTime = minutesToTime(startM + (durM > 0 ? durM : 0));
  }

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
                  style={{ display: "none" }}
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
        <div className="max-w=[1800px] mx-auto p-6">
          <div
            className={`${isAdmin ? "flex flex-col xl:flex-row gap-4" : ""}`}
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
                onDuplicateJob={startDuplicateJob}
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

      {isJobModalOpen && activeJobId && (
        <JobModal
          job={state.jobs.find((j) => j.id === activeJobId)}
          drivers={state.drivers || []}
          tractors={state.tractors || []}
          trailers={state.trailers || []}
          locations={state.locations || []}
          allJobs={state.jobs || []}
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

      {/* ✅ مودال نسخ الجوب */}
      {isAdmin && duplicateJobConfig && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Duplicate job
            </h3>
            <p className="text-xs text-gray-500">
              اختر اليوم ووقت البداية والمدة للجوب المنسوخة.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={duplicateJobConfig.date || ""}
                  onChange={(e) =>
                    setDuplicateJobConfig((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-600 mb-1">
                    Start time
                  </label>
                  <input
                    type="time"
                    value={duplicateJobConfig.start || ""}
                    onChange={(e) =>
                      setDuplicateJobConfig((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-1">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={duplicateJobConfig.durationHours}
                    onChange={(e) =>
                      setDuplicateJobConfig((prev) => ({
                        ...prev,
                        durationHours: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {duplicateEndTime && (
                <div className="text-[11px] text-gray-500">
                  End time:{" "}
                  <span className="font-medium text-gray-800">
                    {duplicateEndTime}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancelDuplicateJob}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDuplicateJob}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-700"
              >
                Create copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
