// src/components/Drivers.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { resolveDriverPhotoUrl } from "../lib/photoUrl";
import { Plus, Trash2, ImageIcon, Save, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  apiGetState,
  apiSaveState,
  apiUploadDriverPhoto,
  apiDeleteDriver,
} from "../lib/api";
import AdminDriverSchedule from "../components/AdminDriverSchedule";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
}

function Card({ title, children, right, className = "" }) {
  return (
    <div className={"bg-white border border-gray-200 rounded-xl shadow-sm " + className}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Th({ children, center, right }) {
  return (
    <th
      className={[
        "px-2 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide",
        center ? "text-center" : right ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({ children, center, right }) {
  return (
    <td
      className={[
        "px-2 py-2 align-middle",
        center ? "text-center" : right ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/* ----- Photo uploader (keeps logic) ----- */
function PhotoUploadButton({ driver, onChange }) {
  const inputRef = useRef(null);
  const initials =
    (driver.name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  async function handleSelectFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Upload original to server (keeps filesystem behavior)
      const res = await apiUploadDriverPhoto(driver.id, file);
      // Backend returns { url } in production; support both keys.
      const url = res?.photoUrl || res?.url;
      if (url) {
        onChange("photoUrl", url);
        // Ensure we never persist base64 blobs to DB/state.
        onChange("photoPreview", "");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload photo. Please try again.");
    } finally {
      e.target.value = "";
    }
  }
  const photoSrc = driver.photoUrl ? resolveDriverPhotoUrl(driver.photoUrl) : "";

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept="image/*"
        ref={inputRef}
        onChange={handleSelectFile}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm"
        title="Upload photo"
        type="button"
      >
        <ImageIcon size={16} />
        <span className="hidden sm:inline">Upload</span>
      </button>
      {photoSrc ? (
        <a
          href={photoSrc}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-700 hover:underline"
        >
          View
        </a>
      ) : null}
    </div>
  );
}

function DriverListItem({ driver, isSelected, onSelect, onDelete }) {
  const initials =
    (driver.name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const photoSrc = driver.photoUrl ? resolveDriverPhotoUrl(driver.photoUrl) : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors " +
        (isSelected
          ? "border-blue-200 bg-blue-50/60"
          : "border-gray-100 bg-white hover:bg-gray-50")
      }
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 text-sm flex-shrink-0">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={driver.name || "driver"}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-sm text-gray-900 truncate">
            {driver.name || "(no name)"}
          </div>
          {driver.code ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              {driver.code}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
          {driver.canNight ? <span>🌙 Night</span> : <span className="opacity-40">🌙 Night</span>}
          {driver.sleepsInCab ? <span>🛏️ Cab</span> : <span className="opacity-40">🛏️ Cab</span>}
          {driver.doubleMannedEligible ? <span>👥 2-man</span> : <span className="opacity-40">👥 2-man</span>}
          <span className="ml-auto">⭐ {Number(driver.rating || 0)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
        title="Delete driver"
      >
        <Trash2 size={16} />
      </button>
    </button>
  );
}

function DriverDetails({ driver, onChange }) {
  if (!driver) {
    return (
      <div className="text-sm text-gray-500">
        Select a driver from the list to edit details.
      </div>
    );
  }
  const photoSrc = driver.photoUrl ? resolveDriverPhotoUrl(driver.photoUrl) : "";
  const initials =
    (driver.name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-600 text-lg font-semibold">
          {photoSrc ? (
            <img src={photoSrc} alt={driver.name || "driver"} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gray-500">Driver ID</div>
          <div className="text-xs font-mono text-gray-700 break-all">{driver.id}</div>
        </div>
        <PhotoUploadButton driver={driver} onChange={onChange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700">Name</label>
          <input
            value={driver.name || ""}
            onChange={(e) => onChange("name", e.target.value)}
            className="input-field h-11 text-sm bg-white mt-1"
            placeholder="Driver name…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Code (optional)</label>
          <input
            value={driver.code || ""}
            onChange={(e) => onChange("code", e.target.value)}
            className="input-field h-11 text-sm bg-white mt-1"
            placeholder="Code / internal reference…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Rating</label>
          <input
            type="number"
            min="0"
            max="5"
            step="0.5"
            value={Number(driver.rating || 0)}
            onChange={(e) => onChange("rating", Number(e.target.value || 0))}
            className="input-field h-11 text-sm bg-white mt-1"
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!driver.canNight}
              onChange={(e) => onChange("canNight", e.target.checked)}
            />
            <span className="text-gray-700">Night shift OK</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!driver.sleepsInCab}
              onChange={(e) => onChange("sleepsInCab", e.target.checked)}
            />
            <span className="text-gray-700">Sleeps in cab</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!driver.doubleMannedEligible}
              onChange={(e) => onChange("doubleMannedEligible", e.target.checked)}
            />
            <span className="text-gray-700">2-man eligible</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default function AdminDriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!user) return <Navigate to="/login" replace />;

  const [fullState, setFullState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [hasConflict, setHasConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const fullStateRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const safeState = {
          ...apiState,
          drivers: Array.isArray(apiState?.drivers) ? apiState.drivers : [],
        };
        setFullState(safeState);
        fullStateRef.current = safeState;
        // Default selection: first driver (if any)
        const firstId = safeState?.drivers?.[0]?.id || null;
        setSelectedDriverId(firstId);
        isDirtyRef.current = false;
        setIsDirty(false);
        setHasConflict(false);
        setSaveError("");
      } catch (err) {
        console.error("Failed to load drivers:", err);
        setLoadError("Failed to load data from server. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const drivers = useMemo(() => fullState?.drivers || [], [fullState]);

  // Keep selection valid
  useEffect(() => {
    if (!drivers.length) {
      if (selectedDriverId !== null) setSelectedDriverId(null);
      return;
    }
    if (selectedDriverId && drivers.some((d) => d.id === selectedDriverId)) return;
    setSelectedDriverId(drivers[0].id);
  }, [drivers, selectedDriverId]);

  const filteredDrivers = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = String(d?.name || "").toLowerCase();
      const code = String(d?.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [drivers, query]);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function clearDirty() {
    isDirtyRef.current = false;
    setIsDirty(false);
  }

  async function saveDrivers(driversList, { silent = false, retryOnConflict = true } = {}) {
    if (!isAdmin) return;
    const snapshot = fullStateRef.current;
    if (!snapshot) return;
    if (savingRef.current) return;

    savingRef.current = true;
    setIsSaving(true);
    setSaveError("");
    // Never persist large in-memory previews (base64) to the DB/state.
    const sanitizedDrivers = (Array.isArray(driversList) ? driversList : []).map((d) => {
      const { photoPreview, ...rest } = d || {};
      return rest;
    });

    try {
      const nextState = { ...snapshot, drivers: sanitizedDrivers };
      const saved = await apiSaveState(nextState);
      setFullState(saved);
      fullStateRef.current = saved;
      clearDirty();
      setHasConflict(false);
      setLastSavedAt(Date.now());
    } catch (err) {
      console.error(err);

      const msg = String(err?.message || "");
      const isConflict = err?.status === 409 || err?.code === "STATE_VERSION_CONFLICT" || /updated by another user|out of date|reload/i.test(msg);
      if (isConflict) {
        setHasConflict(true);
        // Auto-retry once: refresh latest server state/version, then apply the user's drivers list.
        if (retryOnConflict) {
          try {
            const fresh = await apiGetState();
            const safeFresh = { ...fresh, drivers: Array.isArray(fresh?.drivers) ? fresh.drivers : [] };
            setFullState(safeFresh);
            fullStateRef.current = safeFresh;
            // Try again with the latest version baseline
            const saved2 = await apiSaveState({ ...safeFresh, drivers: sanitizedDrivers });
            setFullState(saved2);
            fullStateRef.current = saved2;
            clearDirty();
            setHasConflict(false);
            setLastSavedAt(Date.now());
            return;
          } catch (e2) {
            console.error("retry saveDrivers failed:", e2);
          }
        }
        setSaveError("This page is out of date because another session saved newer data. Click Reload to sync, then try Save again.");
        if (!silent) {
          alert(
            "Another session saved newer data.\nReload the page to sync, then try saving again."
          );
        }
      } else {
        setSaveError("Failed to save. Please check your connection and try again.");
        if (!silent) alert("Failed to save drivers");
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function scheduleSave(driversList, silent = true) {
    // Debounce to avoid hammering the server when editing availability grid
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDrivers(driversList, { silent });
    }, 700);
  }

  function setDrivers(nextDrivers, { save = true } = {}) {
    const snapshot = fullStateRef.current;
    const prevDrivers = Array.isArray(snapshot?.drivers) ? snapshot.drivers : [];

    let finalDrivers = Array.isArray(nextDrivers) ? nextDrivers : prevDrivers;

    // ✅ Safety guard: if a child component accidentally sends a partial list
    // (e.g., only the selected driver), we merge by id instead of replacing.
    if (Array.isArray(nextDrivers) && nextDrivers.length > 0 && nextDrivers.length < prevDrivers.length) {
      const map = new Map(prevDrivers.map((d) => [d?.id, d]));
      for (const d of nextDrivers) {
        if (!d?.id) continue;
        map.set(d.id, { ...(map.get(d.id) || {}), ...(d || {}) });
      }
      finalDrivers = Array.from(map.values());
    }

    setFullState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, drivers: finalDrivers };
      fullStateRef.current = next;
      return next;
    });

    markDirty();
    if (save) scheduleSave(finalDrivers, true);
  }

  async function handleDeleteDriver(id) {
    if (!isAdmin) return;
    const ok = window.confirm("Delete this driver? (Can be restored in DB via soft delete)");
    if (!ok) return;

    try {
      await apiDeleteDriver(id); // explicit delete intent header is included in api
      setDrivers(drivers.filter((d) => d.id !== id), { save: false });
    } catch (e) {
      console.error(e);
      alert("Delete failed. Nothing was removed from the server.");
    }
  }

  async function handleAddDriver() {
    const newDriver = {
      id: uid(),
      name: "New Driver",
      code: "",
      canNight: true,
      sleepsInCab: false,
      doubleMannedEligible: true,
      rating: 0,
      photoUrl: "",
      weekAvailability: [0, 1, 2, 3, 4, 5, 6],
      leaves: [],
    };
    const next = [...drivers, newDriver];
    // Update UI immediately, then do a visible save once (so the user knows it worked).
    setDrivers(next, { save: false });
    setSelectedDriverId(newDriver.id);
    await saveDrivers(next, { silent: false });
  }

  function handleChangeDriver(driverId, field, value) {
    const next = drivers.map((d) =>
      d.id === driverId ? { ...d, [field]: value } : d
    );
    setDrivers(next, { save: true });
  }

  async function handleReload() {
    setLoading(true);
    setLoadError("");
    try {
      const apiState = await apiGetState();
      const safeState = {
        ...apiState,
        drivers: Array.isArray(apiState?.drivers) ? apiState.drivers : [],
      };
      setFullState(safeState);
      fullStateRef.current = safeState;
      // Keep selection if it still exists, otherwise select first
      setSelectedDriverId((prevId) => {
        const exists = safeState?.drivers?.some((d) => d.id === prevId);
        return exists ? prevId : safeState?.drivers?.[0]?.id || null;
      });
      clearDirty();
      setHasConflict(false);
      setSaveError("");
    } catch (e) {
      console.error(e);
      setLoadError("Failed to reload data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNow() {
    await saveDrivers(drivers, { silent: false });
  }

  if (!isAdmin) {
    return (
      <div className="p-4 text-sm text-gray-500">
        You must be admin to view this page.
      </div>
    );
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  if (loadError) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
          {loadError}
        </div>
      </div>
    );
  }

  const statusLabel = hasConflict
    ? "Out of date"
    : isSaving
    ? "Saving…"
    : isDirty
    ? "Unsaved"
    : "Saved";

  const statusClass = hasConflict
    ? "bg-yellow-50 text-yellow-800 border-yellow-200"
    : isSaving
    ? "bg-blue-50 text-blue-800 border-blue-200"
    : isDirty
    ? "bg-orange-50 text-orange-800 border-orange-200"
    : "bg-green-50 text-green-800 border-green-200";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1800px] mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
            <p className="text-sm text-gray-600 mt-1">
              Add drivers, upload photos, and manage availability & leaves. Changes auto-save, and you can also save manually.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={
              "text-xs px-3 py-1 rounded-full border " + statusClass
            }>
              {statusLabel}
              {lastSavedAt && !isDirty && !isSaving && !hasConflict ? (
                <span className="ml-2 text-[11px] text-gray-600">
                  {new Date(lastSavedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </span>

            <button
              onClick={handleSaveNow}
              disabled={!isDirty || isSaving || hasConflict}
              className={[
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                !isDirty || isSaving || hasConflict
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-gray-900 hover:bg-black text-white",
              ].join(" ")}
              title={hasConflict ? "Reload first" : "Save now"}
            >
              <Save size={16} /> Save
            </button>

            <button
              onClick={handleReload}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-medium"
              title="Reload from server"
            >
              <RefreshCw size={16} /> Reload
            </button>

            <button
              onClick={handleAddDriver}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              <Plus size={16} /> Add Driver
            </button>
          </div>
        </div>

        {saveError ? (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            {saveError}
          </div>
        ) : null}

        {hasConflict ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded-lg p-3">
            Another admin session saved newer data. Click <b>Reload</b> to sync before saving.
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card
            title="Drivers List"
            right={
              <div className="relative w-full md:w-72">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or code…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            }
          >
            <div className="rounded-lg border border-gray-100 overflow-auto max-h-[72vh] tiny-scrollbar bg-white">
              <div className="p-3 space-y-2">
                {filteredDrivers.map((driver) => (
                  <DriverListItem
                    key={driver.id}
                    driver={driver}
                    isSelected={driver.id === selectedDriverId}
                    onSelect={() => setSelectedDriverId(driver.id)}
                    onDelete={() => handleDeleteDriver(driver.id)}
                  />
                ))}
                {filteredDrivers.length === 0 ? (
                  <div className="py-10 text-center text-gray-500 text-sm">
                    {drivers.length === 0 ? (
                      <div className="space-y-2">
                        <div className="font-medium text-gray-700">No drivers yet</div>
                        <div className="text-xs text-gray-500">
                          Click “Add Driver” to create your first driver.
                        </div>
                      </div>
                    ) : (
                      "No drivers match your search."
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="xl:col-span-2">
            <div className="space-y-6">
              <Card
                title="Driver Details"
                right={
                  selectedDriverId ? (
                    <div className="text-xs text-gray-500">
                      Editing: {drivers.find((d) => d.id === selectedDriverId)?.name || "Driver"}
                    </div>
                  ) : null
                }
              >
                <DriverDetails
                  driver={drivers.find((d) => d.id === selectedDriverId)}
                  onChange={(field, value) =>
                    selectedDriverId
                      ? handleChangeDriver(selectedDriverId, field, value)
                      : null
                  }
                />
              </Card>

              <Card title="Availability & Leaves">
                {/* Let the page scroll naturally (no inner scroll trap) */}
                <AdminDriverSchedule
                  drivers={drivers}
                  selectedId={selectedDriverId}
                  onSaveDrivers={(nextDrivers) =>
                    setDrivers(nextDrivers, { save: true })
                  }
                />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
