// src/components/DistanceEditor.jsx
import React, { useState } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";

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

const DistanceEditor = ({ state, onUpdate, onClose }) => {
  const [locations, setLocations] = useState(
    toLocationObjects(state.locations)
  );
  const [distanceKm, setDistanceKm] = useState(state.distanceKm || {});
  const [newLocation, setNewLocation] = useState("");

  const handleSave = () => {
    onUpdate({
      ...state,
      locations,
      distanceKm,
    });
    onClose();
  };

  const addLocation = () => {
    if (newLocation && !locations.find((l) => l.name === newLocation)) {
      const newLoc = {
        id: `loc-${crypto.randomUUID()}`,
        name: newLocation,
      };
      const updatedLocations = [...locations, newLoc];
      const updatedDistances = { ...distanceKm };
      updatedDistances[newLoc.name] = {};
      updatedLocations.forEach((loc) => {
        if (loc.name !== newLoc.name) {
          updatedDistances[newLoc.name][loc.name] = 0;
          updatedDistances[loc.name] = updatedDistances[loc.name] || {};
          updatedDistances[loc.name][newLoc.name] = 0;
        }
      });
      setLocations(updatedLocations);
      setDistanceKm(updatedDistances);
      setNewLocation("");
    }
  };

  const removeLocation = (locName) => {
    if (locations.length <= 2) {
      alert("You need at least 2 locations");
      return;
    }
    const updatedLocations = locations.filter((l) => l.name !== locName);
    const updatedDistances = { ...distanceKm };
    delete updatedDistances[locName];
    updatedLocations.forEach((loc) => {
      if (updatedDistances[loc.name]) {
        delete updatedDistances[loc.name][locName];
      }
    });
    setLocations(updatedLocations);
    setDistanceKm(updatedDistances);
  };

  const updateDistance = (from, to, value) => {
    setDistanceKm((prev) => ({
      ...prev,
      [from]: {
        ...prev[from],
        [to]: parseFloat(value) || 0,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Distance Matrix Editor
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="New location name..."
              className="input-field flex-1"
            />
            <button
              onClick={addLocation}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Add Location
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 font-medium text-gray-700">
                    From \ To
                  </th>
                  {locations.map((location) => (
                    <th
                      key={location.id}
                      className="border border-gray-300 p-2 bg-gray-50 font-medium text-gray-700"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>{location.name}</span>
                        {locations.length > 2 && (
                          <button
                            onClick={() => removeLocation(location.name)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Remove location"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locations.map((fromLocation) => (
                  <tr key={fromLocation.id}>
                    <td className="border border-gray-300 p-2 bg-gray-50 font-medium text-gray-700">
                      {fromLocation.name}
                    </td>
                    {locations.map((toLocation) => (
                      <td
                        key={toLocation.id}
                        className="border border-gray-300 p-1"
                      >
                        {fromLocation.id === toLocation.id ? (
                          <div className="text-center text-gray-400">-</div>
                        ) : (
                          <input
                            type="number"
                            value={
                              distanceKm[fromLocation.name]?.[
                                toLocation.name
                              ] || 0
                            }
                            onChange={(e) =>
                              updateDistance(
                                fromLocation.name,
                                toLocation.name,
                                e.target.value
                              )
                            }
                            className="w-full border-0 focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-center"
                            min="0"
                            step="1"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Instructions</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Enter distances in kilometers between locations</li>
              <li>• These are used by jobs (start → end)</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save size={18} />
            Save Distances
          </button>
        </div>
      </div>
    </div>
  );
};

export default DistanceEditor;
