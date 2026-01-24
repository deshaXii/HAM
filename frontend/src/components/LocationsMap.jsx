// src/components/LocationsMap.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { MapPin, Save, Trash2, Loader2 } from "lucide-react";
import { apiGetState, apiSaveState, apiDeleteLocation } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

// مركز هولندا
const NL_CENTER = { lat: 52.1326, lng: 5.2913 };
const MAP_ZOOM = 7;
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

// مسافة هفرسين
function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const c =
    2 *
    Math.asin(
      Math.sqrt(sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2)
    );
  return Math.round(R * c);
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
    ];
  }
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `loc-${idx}-${item.replace(/\s+/g, "-").toLowerCase()}`,
        name: item,
        lat: NL_CENTER.lat,
        lng: NL_CENTER.lng,
      };
    }
    return {
      id: item.id || `loc-${idx}-${(item.name || "loc").toLowerCase()}`,
      name: item.name || `Location ${idx + 1}`,
      lat: typeof item.lat === "number" ? item.lat : NL_CENTER.lat,
      lng: typeof item.lng === "number" ? item.lng : NL_CENTER.lng,
    };
  });
}

function buildDistanceMatrixFromLocations(locations) {
  const dist = {};
  locations.forEach((from) => {
    dist[from.name] = dist[from.name] || {};
    locations.forEach((to) => {
      if (from.id === to.id) return;
      const km = haversineKm(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng }
      );
      dist[from.name][to.name] = km;
    });
  });
  return dist;
}

export default function LocationsMap() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [clickedPos, setClickedPos] = useState(null);
  const [newName, setNewName] = useState("");

  // حمّل جوجل
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const normalized = {
          ...apiState,
          locations: normalizeLocations(apiState.locations),
        };
        setState(normalized);
      } catch (e) {
        console.error("failed to load locations page", e);
        setState({
          locations: normalizeLocations(null),
          distanceKm: {},
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onMapClick = useCallback(
    (e) => {
      if (!isAdmin) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setClickedPos({ lat, lng });
      setNewName("");
    },
    [isAdmin]
  );

  const addLocation = () => {
    if (!state || !clickedPos) return;
    const name = newName.trim() || `Location ${state.locations.length + 1}`;
    const newLoc = {
      id: `loc-${crypto.randomUUID()}`,
      name,
      lat: clickedPos.lat,
      lng: clickedPos.lng,
    };
    const newLocations = [...state.locations, newLoc];
    const newMatrix = buildDistanceMatrixFromLocations(newLocations);
    setState({
      ...state,
      locations: newLocations,
      distanceKm: newMatrix,
    });
    setClickedPos(null);
    setNewName("");
  };

  const removeLocation = (locId) => {
    if (!state) return;
    (async () => {
      try {
        await apiDeleteLocation(locId);
        const keep = state.locations.filter((l) => l.id !== locId);
        const newMatrix = buildDistanceMatrixFromLocations(keep);
        setState({
          ...state,
          locations: keep,
          distanceKm: newMatrix,
        });
      } catch (e) {
        console.error(e);
        alert("Delete failed. Nothing was removed from the server.");
      }
    })();
  };

  const saveAll = async () => {
    if (!state) return;
    try {
      await apiSaveState({
        ...state,
        locations: state.locations,
        distanceKm: state.distanceKm,
      });
      alert("Locations & distances saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save.");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-600">
        <Loader2 className="animate-spin" size={16} /> Loading locations...
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-6 text-red-600 text-sm">
        Google Maps failed to load. Check your API key.
      </div>
    );
  }
  if (!isLoaded) {
    return <div className="p-6 text-gray-500 text-sm">Loading map...</div>;
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 min-h-screen bg-gray-50">
      {/* header */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Locations & Map (Google Maps)
          </h2>
          <p className="text-xs text-gray-500">
            Click on the map to add a location. Distances are computed
            automatically between all locations.
          </p>
        </div>
        {isAdmin ? (
          <button
            onClick={saveAll}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Save size={14} />
            Save
          </button>
        ) : (
          <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Read only
          </span>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* map */}
        <div className="lg:w-1/2 bg-white border border-gray-200 rounded-xl shadow-sm min-h-[480px] overflow-hidden">
          <GoogleMap
            zoom={MAP_ZOOM}
            center={NL_CENTER}
            mapContainerStyle={MAP_CONTAINER_STYLE}
            onClick={onMapClick}
          >
            {/* existing markers */}
            {state.locations.map((loc) => (
              <Marker
                key={loc.id}
                position={{ lat: loc.lat, lng: loc.lng }}
                label={loc.name.substring(0, 4)}
              />
            ))}

            {/* clicked point (pending) */}
            {clickedPos && (
              <Marker
                position={clickedPos}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 6,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                }}
              />
            )}
          </GoogleMap>
        </div>

        {/* right side */}
        <div className="lg:w-1/2 flex flex-col gap-4">
          {clickedPos && isAdmin && (
            <div className="bg-white border border-blue-200 rounded-lg p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                <MapPin size={14} className="text-blue-500" />
                Add location
              </h3>
              <div className="grid grid-cols-2 gap-2 mb-2 text-xs text-gray-500">
                <div>Lat: {clickedPos.lat.toFixed(6)}</div>
                <div>Lng: {clickedPos.lng.toFixed(6)}</div>
              </div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Location name (e.g. Rotterdam DC)"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addLocation}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded"
              >
                Add
              </button>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Saved Locations ({state.locations.length})
              </h3>
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y">
              {state.locations.map((loc) => (
                <div
                  key={loc.id}
                  className="px-4 py-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {loc.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => removeLocation(loc.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {state.locations.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  No locations yet. Click on the map to add.
                </div>
              )}
            </div>
          </div>

          {/* quick view of matrix */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3">
            <h3 className="text-xs font-semibold text-gray-700 mb-2">
              Distance Matrix (km)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border text-[10px]">
                <thead>
                  <tr>
                    <th className="border px-1 py-1 bg-gray-50">From \ To</th>
                    {state.locations.map((loc) => (
                      <th key={loc.id} className="border px-1 py-1 bg-gray-50">
                        {loc.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.locations.map((from) => (
                    <tr key={from.id}>
                      <td className="border px-1 py-1 bg-gray-50">
                        {from.name}
                      </td>
                      {state.locations.map((to) => (
                        <td
                          key={to.id}
                          className="border px-1 py-1 text-center"
                        >
                          {from.id === to.id
                            ? "-"
                            : state.distanceKm?.[from.name]?.[to.name] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              هذه القيم هي اللي هيشوفها الـ JobModal في الـstartPoint /
              endPoint.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
