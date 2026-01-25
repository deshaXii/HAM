// src/components/LocationsMap.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Plus, Loader2 } from "lucide-react";
import { apiGetState, apiSaveState } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

function toLocationObjects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `loc-${idx}-${item.replace(/\s+/g, "-").toLowerCase()}`,
        name: item,
      };
    }
    return {
      id: item.id || `loc-${idx}-${(item.name || "loc").toLowerCase()}`,
      name: item.name || `Location ${idx + 1}`,
    };
  });
}

function ensureMatrixSymmetry(distanceKm, names) {
  const dist = typeof distanceKm === "object" && distanceKm ? { ...distanceKm } : {};
  // ensure rows
  for (const from of names) {
    dist[from] = typeof dist[from] === "object" && dist[from] ? { ...dist[from] } : {};
  }
  // ensure cols + symmetry
  for (const from of names) {
    for (const to of names) {
      if (from === to) continue;
      const a = dist[from]?.[to];
      const b = dist[to]?.[from];
      let v = 0;
      if (typeof a === "number") v = a;
      else if (typeof b === "number") v = b;
      else if (a !== undefined && a !== null && a !== "") v = Number(a) || 0;
      else if (b !== undefined && b !== null && b !== "") v = Number(b) || 0;
      dist[from][to] = v;
      dist[to][from] = v;
    }
  }
  return dist;
}

export default function LocationsMap() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newCity, setNewCity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiGetState();
      const locs = toLocationObjects(s?.locations || []);
      const names = locs.map((l) => l.name);
      const distanceKm = ensureMatrixSymmetry(s?.distanceKm || {}, names);
      setState({ ...(s || {}), locations: locs, distanceKm });
    } catch (e) {
      console.error(e);
      setState({
        locations: [],
        distanceKm: {},
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const locationNames = useMemo(() => {
    const locs = toLocationObjects(state?.locations || []);
    return locs.map((l) => l.name);
  }, [state?.locations]);

  const distanceKm = useMemo(() => {
    return ensureMatrixSymmetry(state?.distanceKm || {}, locationNames);
  }, [state?.distanceKm, locationNames]);

  const updateDistance = (from, to, value) => {
    if (!isAdmin) return;
    const km = Math.max(0, Number(value) || 0);
    setState((prev) => {
      const next = { ...(prev || {}) };
      const locs = toLocationObjects(next.locations || []);
      const names = locs.map((l) => l.name);
      const dist = ensureMatrixSymmetry(next.distanceKm || {}, names);
      dist[from] = dist[from] || {};
      dist[to] = dist[to] || {};
      dist[from][to] = km;
      dist[to][from] = km;
      next.locations = locs;
      next.distanceKm = dist;
      return next;
    });
  };

  const addCity = () => {
    if (!isAdmin) return;
    const name = String(newCity || "").trim();
    if (!name) return;

    setState((prev) => {
      const next = { ...(prev || {}) };
      const locs = toLocationObjects(next.locations || []);
      if (locs.some((l) => l.name.toLowerCase() === name.toLowerCase())) return prev;

      const newLoc = { id: `loc-${crypto.randomUUID()}`, name };
      const updatedLocations = [...locs, newLoc];
      const names = updatedLocations.map((l) => l.name);
      const dist = ensureMatrixSymmetry(next.distanceKm || {}, names);
      // initialize new row/col to 0
      dist[name] = dist[name] || {};
      for (const other of names) {
        if (other === name) continue;
        dist[name][other] = dist[name][other] ?? 0;
        dist[other] = dist[other] || {};
        dist[other][name] = dist[other][name] ?? 0;
      }
      next.locations = updatedLocations;
      next.distanceKm = dist;
      return next;
    });

    setNewCity("");
  };

  const handleSave = async () => {
    if (!isAdmin || !state) return;
    setSaving(true);
    try {
      // Ensure consistent matrix before saving
      const locs = toLocationObjects(state.locations || []);
      const names = locs.map((l) => l.name);
      const dist = ensureMatrixSymmetry(state.distanceKm || {}, names);

      const payload = {
        ...state,
        locations: locs,
        distanceKm: dist,
      };

      const saved = await apiSaveState(payload);
      // reload to align with server meta/version
      const locs2 = toLocationObjects(saved?.locations || locs);
      const names2 = locs2.map((l) => l.name);
      const dist2 = ensureMatrixSymmetry(saved?.distanceKm || dist, names2);
      setState({ ...(saved || payload), locations: locs2, distanceKm: dist2 });

      alert("Distance matrix saved ✅");
    } catch (e) {
      console.error(e);
      alert("Failed to save distance matrix ❌");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 text-gray-600">
        <div className="max-w-[1800px] mx-auto flex items-center gap-2">
          <Loader2 className="animate-spin" size={18} />
          Loading distance matrix...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Distance Matrix (km)</h1>
            <p className="text-sm text-gray-600 mt-1">
              Add cities and enter distances manually. This matrix is used in job routing (Start / End points).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder="Add city..."
                className="border rounded-lg px-3 py-2 text-sm w-56"
                disabled={!isAdmin}
              />
              <button
                onClick={addCity}
                disabled={!isAdmin || !newCity.trim()}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                <Plus size={16} /> Add
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={!isAdmin || saving}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Save
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-[900px] w-full text-xs md:text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-gray-200 sticky left-0 bg-gray-50 z-20">From \\ To</th>
                  {locationNames.map((to) => (
                    <th key={to} className="px-3 py-2 border-b border-gray-200 text-left whitespace-nowrap">
                      {to}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locationNames.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-gray-500" colSpan={locationNames.length + 1}>
                      No cities yet. Add your first city above.
                    </td>
                  </tr>
                ) : (
                  locationNames.map((from) => (
                    <tr key={from} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-white z-10 border-r border-gray-100 whitespace-nowrap">
                        {from}
                      </td>
                      {locationNames.map((to) => {
                        if (from === to) {
                          return (
                            <td key={`${from}-${to}`} className="px-3 py-2 text-gray-300">
                              —
                            </td>
                          );
                        }
                        const v = distanceKm?.[from]?.[to] ?? 0;
                        return (
                          <td key={`${from}-${to}`} className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={v}
                              disabled={!isAdmin}
                              onChange={(e) => updateDistance(from, to, e.target.value)}
                              className="w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Tip: Distances are symmetric (A→B = B→A). Editing one cell updates both.
        </div>
      </div>
    </div>
  );
}
