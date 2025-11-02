import React, { useState } from "react";
import { X, Save } from "lucide-react";

const SettingsPanel = ({ state, onUpdate, onClose }) => {
  const [settings, setSettings] = useState(state.settings);

  const handleSave = () => {
    onUpdate({
      ...state,
      settings,
    });
    onClose();
  };

  const updateRate = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      rates: {
        ...prev.rates,
        [field]: parseFloat(value) || 0,
      },
    }));
  };

  const updateTrailerCost = (type, value) => {
    setSettings((prev) => ({
      ...prev,
      trailerDayCost: {
        ...prev.trailerDayCost,
        [type]: parseFloat(value) || 0,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Rates Section */}
          <section>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Rates & Pricing
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Loaded KM Revenue (€/km)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.rates.loadedKmRevenue}
                  onChange={(e) =>
                    updateRate("loadedKmRevenue", e.target.value)
                  }
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empty KM Cost (€/km)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.rates.emptyKmCost}
                  onChange={(e) => updateRate("emptyKmCost", e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tractor Loaded Cost (€/km)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.rates.tractorKmCostLoaded}
                  onChange={(e) =>
                    updateRate("tractorKmCostLoaded", e.target.value)
                  }
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Hour Cost (€/h)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.rates.driverHourCost}
                  onChange={(e) => updateRate("driverHourCost", e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Night Premium (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.rates.nightPremiumPct}
                  onChange={(e) =>
                    updateRate("nightPremiumPct", e.target.value)
                  }
                  className="input-field"
                />
              </div>
            </div>
          </section>

          {/* Trailer Costs Section */}
          <section>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Trailer Daily Costs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reefer (€/day)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.trailerDayCost.reefer || 0}
                  onChange={(e) => updateTrailerCost("reefer", e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Box (€/day)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.trailerDayCost.box || 0}
                  onChange={(e) => updateTrailerCost("box", e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taut (€/day)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.trailerDayCost.taut || 0}
                  onChange={(e) => updateTrailerCost("taut", e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chassis (€/day)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.trailerDayCost.chassis || 0}
                  onChange={(e) => updateTrailerCost("chassis", e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </section>
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
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
