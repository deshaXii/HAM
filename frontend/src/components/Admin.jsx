// front/src/components/Admin.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import useServerEventRefetch from "../hooks/useServerEventRefetch";
import MultiTypeSelect from "./MultiTypeSelect";
import { TRAILER_TAXONOMY } from "../constants/trailerTaxonomy";
import { TRACTOR_TAXONOMY } from "../constants/tractorTaxonomy";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Save,
  Truck,
  MapPin,
  Users,
  X,
  ImageIcon,
} from "lucide-react";
import AdminExtras from "./AdminExtras";
import { useAuth } from "../contexts/AuthContext";
import { apiGetState, apiSaveState, apiUploadDriverPhoto } from "../lib/api";
import * as XLSX from "xlsx";

// ========== DEFAULT STATE ==========
const defaultState = {
  drivers: [],
  tractors: [],
  trailers: [],
  jobs: [],
  weekStart: "2025-11-02",
  locations: [
    "Depot-Hoofddorp",
    "AH-Zaandam",
    "Aldi-Culemborg",
    "Action-Zwaagdijk",
    "PostNL-Amsterdam",
  ],
  distanceKm: {},
};
function normalizeTrailers(list) {
  return (Array.isArray(list) ? list : []).map((t) => ({
    ...t,
    // دعم خلفي: لو كان فيه t.type قديم نحوله لمصفوفة
    types: Array.isArray(t.types) ? t.types : t.type ? [t.type] : [],
  }));
}
function buildSafeState(raw) {
  const src = raw || {};
  return {
    ...defaultState,
    ...src,
    drivers: Array.isArray(src.drivers) ? src.drivers : [],
    tractors: Array.isArray(src.tractors) ? src.tractors : [],
    trailers: normalizeTrailers(src.trailers),
    jobs: Array.isArray(src.jobs) ? src.jobs : [],
    locations: Array.isArray(src.locations)
      ? src.locations
      : [...defaultState.locations],
    distanceKm:
      typeof src.distanceKm === "object" && src.distanceKm !== null
        ? src.distanceKm
        : {},
    settings:
      typeof src.settings === "object" && src.settings !== null
        ? { ...defaultState.settings, ...src.settings }
        : { ...defaultState.settings },
  };
}

// Excel helpers (unchanged except we keep photoUrl)
function exportStateToExcel(anyState) {
  const driversSheetData = anyState.drivers.map((d) => ({
    id: d.id,
    name: d.name,
    canNight: d.canNight ? 1 : 0,
    sleepsInCab: d.sleepsInCab ? 1 : 0,
    doubleMannedEligible: d.doubleMannedEligible ? 1 : 0,
    photoUrl: d.photoUrl || "",
  }));
  const tractorsSheetData = anyState.tractors.map((t) => ({
    id: t.id,
    code: t.code,
    plate: t.plate || "",
    currentLocation: t.currentLocation || "",
    doubleManned: t.doubleManned ? 1 : 0,
  }));
  const trailersSheetData = anyState.trailers.map((t) => ({
    id: t.id,
    code: t.code,
    plate: t.plate || "",
    types: Array.isArray(t.types) ? t.types.join(",") : "",
  }));
  const jobsSheetData = anyState.jobs.map((j) => ({
    id: j.id,
    date: j.date,
    start: j.start,
    slot: j.slot,
    client: j.client,
    pickup: j.pickup,
    dropoff: j.dropoff,
    durationHours: j.durationHours,
    pricingType: j.pricing?.type,
    pricingValue: j.pricing?.value,
    tractorId: j.tractorId || "",
    trailerId: j.trailerId || "",
    driverIds: Array.isArray(j.driverIds) ? j.driverIds.join(",") : "",
    notes: j.notes || "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(driversSheetData),
    "Drivers"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tractorsSheetData),
    "Tractors"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(trailersSheetData),
    "Trailers"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(jobsSheetData),
    "Jobs"
  );
  XLSX.writeFile(wb, "fleet-export.xlsx");
}

function parseBool(val) {
  return val === true || val === 1 || val === "1" || val === "true";
}

function importExcelFile(file, setDraft) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: "array" });
    const sheetToJSON = (name) => {
      const ws = wb.Sheets[name];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { defval: "" });
    };
    const importedDrivers = sheetToJSON("Drivers").map((row) => ({
      id: row.id || crypto.randomUUID(),
      name: row.name || "",
      canNight: parseBool(row.canNight),
      sleepsInCab: parseBool(row.sleepsInCab),
      doubleMannedEligible: parseBool(row.doubleMannedEligible),
      photoUrl: row.photoUrl || "",
      // 🔸 لو مش موجودة في الإكسل، خليه كل الأيام
      weekAvailability: [0, 1, 2, 3, 4, 5, 6],
      leaves: [],
    }));
    const importedTractors = sheetToJSON("Tractors").map((row) => ({
      id: row.id || crypto.randomUUID(),
      code: row.code || "",
      plate: row.plate || "",
      currentLocation: row.currentLocation || "",
      doubleManned: parseBool(row.doubleManned),
    }));
    const importedTrailers = sheetToJSON("Trailers").map((row) => ({
      id: row.id || crypto.randomUUID(),
      code: row.code || "",
      plate: row.plate || "",
      type: row.type || "",
    }));
    const importedJobs = sheetToJSON("Jobs").map((row) => ({
      id: row.id || `job-${crypto.randomUUID()}`,
      date: row.date || "",
      start: row.start || "08:00",
      slot: row.slot || "day",
      client: row.client || "Client",
      pickup: row.pickup || "",
      dropoff: row.dropoff || "",
      durationHours: Number(row.durationHours) || 8,
      pricing: {
        type: row.pricingType || "per_km",
        value: Number(row.pricingValue) || 0,
      },
      tractorId: row.tractorId || "",
      trailerId: row.trailerId || "",
      driverIds:
        typeof row.driverIds === "string" && row.driverIds.trim() !== ""
          ? row.driverIds.split(",").map((s) => s.trim())
          : [],
      notes: row.notes || "",
    }));
    setDraft((prev) =>
      buildSafeState({
        ...prev,
        drivers: importedDrivers,
        tractors: importedTractors,
        trailers: importedTrailers,
        jobs: importedJobs,
      })
    );
  };
  reader.readAsArrayBuffer(file);
}

export default function Admin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [serverState, setServerState] = useState(defaultState);
  const [draft, setDraft] = useState(defaultState);
  const [loading, setLoading] = useState(true);

  const savingRef = useRef(false);
  const latestDraftRef = useRef(defaultState);

  const loadState = useCallback(async () => {
    try {
      const apiState = await apiGetState();
      const safe = buildSafeState(apiState);
      setServerState(safe);
      setDraft(safe);
      latestDraftRef.current = safe;
    } catch {
      const safe = buildSafeState(null);
      setServerState(safe);
      setDraft(safe);
      latestDraftRef.current = safe;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useServerEventRefetch(["state:updated"], loadState);

  async function handleSaveChanges(next, silent = false) {
    if (!isAdmin) return;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const saved = await apiSaveState(next);
      const safe = buildSafeState(saved || next);
      setServerState(safe);
      setDraft(safe);
      latestDraftRef.current = safe;
      if (!silent) alert("Saved to database ✅");
    } catch (e) {
      console.error(e);
      if (!silent) alert("Failed to save ❌");
    } finally {
      savingRef.current = false;
    }
  }

  // Auto-Save كل 10 ثواني
  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(() => {
      handleSaveChanges(latestDraftRef.current, true);
    }, 10000);
    return () => clearInterval(id);
  }, [isAdmin]);

  // حفظ قبل الخروج
  useEffect(() => {
    if (!isAdmin) return;
    const h = () => handleSaveChanges(latestDraftRef.current, true);
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isAdmin]);

  const handleExportExcel = () => exportStateToExcel(draft);

  const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (
        window.confirm(
          "This will OVERWRITE your current draft (drivers / tractors / trailers / jobs). Continue?"
        )
      ) {
        importExcelFile(file, setDraft);
      }
    }
    event.target.value = "";
  };

  const addDraftItem = (type, template) => {
    const newItem = { ...template, id: crypto.randomUUID() };
    setDraft((prev) => {
      const list = Array.isArray(prev[type]) ? prev[type] : [];
      const next = { ...prev, [type]: [...list, newItem] };
      latestDraftRef.current = next;
      return next;
    });
  };

  const deleteDraftItem = (type, id) => {
    setDraft((prev) => {
      const list = Array.isArray(prev[type]) ? prev[type] : [];
      const next = { ...prev, [type]: list.filter((item) => item.id !== id) };
      latestDraftRef.current = next;
      return next;
    });
  };

  const updateDraftItem = (type, id, field, value) => {
    setDraft((prev) => {
      const list = Array.isArray(prev[type]) ? prev[type] : [];
      const next = {
        ...prev,
        [type]: list.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        ),
      };
      latestDraftRef.current = next;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 text-gray-600">
        Loading data from server...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto space-y-8">
        {/* HEADER */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            {/* 👇 العنوان */}
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 text-sm mt-1">
              All data is now coming from the shared database. Draft changes
              auto-save every 10s.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Download size={16} /> Export Excel
            </button>

            <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer text-sm font-medium">
              <Upload size={16} /> Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* COUNTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Tractors"
            value={draft?.tractors?.length}
            icon="🚚"
          />
          <StatCard label="Trailers" value={draft?.trailers?.length} icon="🛞" />
          <StatCard label="Drivers" value={draft?.drivers?.length} icon="👤" />
          <StatCard
            label="Planned Tasks"
            value={draft?.jobs?.length}
            icon="📝"
          />
        </div>

        {/* LAYOUT */}
        <div className="grid  gap-6">
          {/* LEFT 2/3 */}
          <div className="space-y-6 lg:col-span-2">
            {/* TRACTORS */}
            <SectionCard
              title="Tractors Management"
              addLabel="Add Tractor"
              onAdd={() =>
                addDraftItem("tractors", {
                  code: "TRK-NEW",
                  plate: "",
                  currentLocation: "",
                  doubleManned: false,
                })
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Code</Th>
                      <Th>Plate</Th>
                      <Th>Type(s)</Th>
                      <Th center>Double Manned</Th>
                      <Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(draft?.tractors || []).map((tractor) => (
                      <tr
                        key={tractor.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <Td>
                          <input
                            value={tractor.code}
                            onChange={(e) =>
                              updateDraftItem(
                                "tractors",
                                tractor.id,
                                "code",
                                e.target.value
                              )
                            }
                            className="input-field text-xs md:text-sm"
                            placeholder="Tractor code..."
                          />
                        </Td>
                        <Td>
                          <input
                            value={tractor.plate || ""}
                            onChange={(e) =>
                              updateDraftItem(
                                "tractors",
                                tractor.id,
                                "plate",
                                e.target.value
                              )
                            }
                            className="input-field text-xs md:text-sm"
                            placeholder="License plate..."
                          />
                        </Td>
                        <Td>
                          <MultiTypeSelect
                            taxonomy={TRACTOR_TAXONOMY}
                            value={
                              Array.isArray(tractor.types) ? tractor.types : []
                            }
                            onChange={(vals) =>
                              updateDraftItem(
                                "tractors",
                                tractor.id,
                                "types",
                                vals
                              )
                            }
                          />
                        </Td>
                        <Td center>
                          <input
                            type="checkbox"
                            checked={!!tractor.doubleManned}
                            onChange={(e) =>
                              updateDraftItem(
                                "tractors",
                                tractor.id,
                                "doubleManned",
                                e.target.checked
                              )
                            }
                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </Td>
                        <Td right>
                          <button
                            onClick={() =>
                              deleteDraftItem("tractors", tractor.id)
                            }
                            className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                            title="Delete tractor"
                          >
                            <Trash2 size={16} />
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* TRAILERS */}
            <SectionCard
              title="Trailers Management"
              addLabel="Add Trailer"
              onAdd={() =>
                addDraftItem("trailers", {
                  code: "TLR-NEW",
                  plate: "",
                  type: "box",
                })
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Code</Th>
                      <Th>Plate</Th>
                      <Th>Type(s)</Th>
                      <Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(draft.trailers || []).map((trailer) => (
                      <tr
                        key={trailer.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <Td>
                          <input
                            value={trailer.code}
                            onChange={(e) =>
                              updateDraftItem(
                                "trailers",
                                trailer.id,
                                "code",
                                e.target.value
                              )
                            }
                            className="input-field text-xs md:text-sm"
                            placeholder="Trailer code..."
                          />
                        </Td>
                        <Td>
                          <input
                            value={trailer.plate || ""}
                            onChange={(e) =>
                              updateDraftItem(
                                "trailers",
                                trailer.id,
                                "plate",
                                e.target.value
                              )
                            }
                            className="input-field text-xs md:text-sm"
                            placeholder="License plate..."
                          />
                        </Td>
                        <Td>
                          <MultiTypeSelect
                            taxonomy={TRAILER_TAXONOMY}
                            value={
                              Array.isArray(trailer.types) ? trailer.types : []
                            }
                            onChange={(vals) =>
                              updateDraftItem(
                                "trailers",
                                trailer.id,
                                "types",
                                vals
                              )
                            }
                          />
                        </Td>
                        <Td right>
                          <button
                            onClick={() =>
                              deleteDraftItem("trailers", trailer.id)
                            }
                            className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                            title="Delete trailer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* DRIVERS */}
            <SectionCard
              title="Drivers Management"
              addLabel="Add Driver"
              onAdd={() =>
                addDraftItem("drivers", {
                  name: "New Driver",
                  canNight: true,
                  sleepsInCab: false,
                  doubleMannedEligible: true,
                  photoUrl: "",
                  // 👇 افتراضي كل الأيام
                  weekAvailability: [0, 1, 2, 3, 4, 5, 6],
                  leaves: [],
                })
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Photo</Th>
                      <Th>Name</Th>
                      <Th center>Night Shift</Th>
                      <Th center>Sleeps in Cab</Th>
                      <Th center>2-man Eligible</Th>
                      <Th center>Rating</Th> {/* NEW */}
                      <Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(draft?.drivers || []).map((driver) => (
                      <DriverRow
                        key={driver.id}
                        driver={driver}
                        onChange={(field, value) =>
                          updateDraftItem("drivers", driver.id, field, value)
                        }
                        onDelete={() => deleteDraftItem("drivers", driver.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          {/* RIGHT PANEL */}
          <div className="space-y-6"></div>
        </div>
      </div>
    </div>
  );
}

/* ----- Driver Row with Photo upload ----- */
function DriverRow({ driver, onChange, onDelete }) {
  const inputRef = useRef(null);
  const initials =
    (driver.name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  async function downscaleToDataURL(
    file,
    maxSize = 256,
    mime = "image/jpeg",
    quality = 0.85
  ) {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL(mime, quality);
  }

  async function handleSelectFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await apiUploadDriverPhoto(driver.id, file);
      if (res?.url) {
        onChange("photoUrl", res.url);
      } else {
        const dataUrl = await downscaleToDataURL(file, 256);
        onChange("photoUrl", dataUrl);
      }
    } catch {
      const dataUrl = await downscaleToDataURL(file, 256);
      onChange("photoUrl", dataUrl);
    } finally {
      e.target.value = "";
    }
  }
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <Td>
        <div className="flex items-center gap-3">
          {driver.photoUrl ? (
            <div className="relative">
              <img
                src={driver.photoUrl}
                alt={driver.name}
                className="h-10 w-10 rounded-full object-cover border border-gray-200"
              />
              <button
                onClick={() => onChange("photoUrl", "")}
                title="Remove photo"
                className="absolute -top-1 -right-1 bg-white border border-gray-300 rounded-full p-0.5 hover:bg-gray-50"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="h-10 w-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50"
            title="Upload/Change photo"
          >
            <ImageIcon size={14} /> Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelectFile}
          />
        </div>
      </Td>

      <Td>
        <input
          value={driver.name || ""}
          onChange={(e) => onChange("name", e.target.value)}
          className="input-field text-xs md:text-sm"
          placeholder="Driver name..."
        />
      </Td>

      <Td center>
        <input
          type="checkbox"
          checked={!!driver.canNight}
          onChange={(e) => onChange("canNight", e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
      </Td>

      <Td center>
        <input
          type="checkbox"
          checked={!!driver.sleepsInCab}
          onChange={(e) => onChange("sleepsInCab", e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
      </Td>

      <Td center>
        <input
          type="checkbox"
          checked={!!driver.doubleMannedEligible}
          onChange={(e) => onChange("doubleMannedEligible", e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
      </Td>

      {/* NEW: Rating */}
      <Td center>
        <input
          type="number"
          min={0}
          max={5}
          step={0.5}
          value={Number.isFinite(Number(driver.rating)) ? driver.rating : 0}
          onChange={(e) => onChange("rating", e.target.value)}
          className="w-20 border border-gray-300 rounded-md px-2 py-1 text-xs text-center"
        />
      </Td>

      <Td right>
        <button
          onClick={onDelete}
          className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
          title="Delete driver"
        >
          <Trash2 size={16} />
        </button>
      </Td>
    </tr>
  );
}

/* ----- small UI helpers ----- */
function StatCard({ label, value, icon, color }) {
  return (
    <div className="card p-4 flex items-center justify-between bg-white border border-gray-200 rounded-xl shadow-sm">
      <div>
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={`p-2 ${color} rounded-lg`}>{icon}</div>
    </div>
  );
}
function SectionCard({ title, addLabel, onAdd, children }) {
  return (
    <section className="card p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <Plus size={16} /> {addLabel}
        </button>
      </div>
      {children}
    </section>
  );
}
function Th({ children, center, right }) {
  return (
    <th
      className={`p-3 font-medium text-gray-700 text-left ${
        center ? "text-center" : ""
      } ${right ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}
function Td({ children, center, right }) {
  return (
    <td
      className={`p-3 align-top ${center ? "text-center" : ""} ${
        right ? "text-right" : ""
      }`}
    >
      {children}
    </td>
  );
}
