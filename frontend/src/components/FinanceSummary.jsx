import React from "react";
import { Euro, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

const FinanceSummary = ({ state }) => {
  const calculateFinance = () => {
    let revenue = 0;
    let driverCost = 0;
    let tractorLoadedCost = 0;
    let emptyKmCost = 0;

    // Calculate empty km per tractor
    const emptyKmPerJob = {};
    state.tractors.forEach((tractor) => {
      const tractorJobs = state.jobs
        .filter((job) => job.tractorId === tractor.id)
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.start.localeCompare(b.start);
        });

      let prevDropoff = tractor.currentLocation;
      tractorJobs.forEach((job) => {
        const pickup = job.pickup || job.startPoint || job.start_point || "";
        const dropoff = job.dropoff || job.endPoint || job.end_point || "";
        const emptyKm = state.distanceKm[prevDropoff]?.[pickup] || 0;
        emptyKmPerJob[job.id] = emptyKm;
        prevDropoff = dropoff || job.dropoff;
      });
    });

    // Calculate job revenues and costs
    state.jobs.forEach((job) => {
      const pickup = job.pickup || job.startPoint || job.start_point || "";
      const dropoff = job.dropoff || job.endPoint || job.end_point || "";
      const loadedKm = state.distanceKm[pickup]?.[dropoff] || 0;

      // Revenue
      if (job.pricing.type === "fixed") {
        revenue += job.pricing.value;
      } else {
        revenue +=
          loadedKm *
          (job.pricing.value || state.settings.rates.loadedKmRevenue);
      }

      // Driver cost
      const driverCount = Math.max(1, job.driverIds.length);
      const nightFactor =
        job.slot === "night"
          ? 1 + state.settings.rates.nightPremiumPct / 100
          : 1;
      driverCost +=
        job.durationHours *
        state.settings.rates.driverHourCost *
        driverCount *
        nightFactor;

      // Tractor loaded cost
      tractorLoadedCost += loadedKm * state.settings.rates.tractorKmCostLoaded;

      // Empty km cost
      emptyKmCost +=
        (emptyKmPerJob[job.id] || 0) * state.settings.rates.emptyKmCost;
    });

    // Trailer day cost
    const trailerDays = new Set();
    state.jobs.forEach((job) => {
      if (job.trailerId) {
        trailerDays.add(`${job.trailerId}-${job.date}`);
      }
    });

    const trailerDayCost = Array.from(trailerDays).reduce((total, key) => {
      const [trailerId, date] = key.split("-");
      const trailer = state.trailers.find((t) => t.id === trailerId);
      if (trailer) {
        return total + (state.settings.trailerDayCost[trailer.type] || 0);
      }
      return total;
    }, 0);

    const totalCost =
      driverCost + tractorLoadedCost + emptyKmCost + trailerDayCost;
    const margin = revenue - totalCost;

    return {
      revenue: Math.round(revenue * 100) / 100,
      driverCost: Math.round(driverCost * 100) / 100,
      tractorLoadedCost: Math.round(tractorLoadedCost * 100) / 100,
      emptyKmCost: Math.round(emptyKmCost * 100) / 100,
      trailerDayCost: Math.round(trailerDayCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      margin: Math.round(margin * 100) / 100,
    };
  };

  const finance = calculateFinance();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={20} className="text-gray-600" />
        <h3 className="font-semibold text-gray-900">Finance Summary</h3>
      </div>

      <div className="space-y-3">
        {/* Revenue */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Revenue</span>
          <span className="font-semibold text-green-600">
            {formatCurrency(finance.revenue)}
          </span>
        </div>

        {/* Costs */}
        <div className="space-y-2 border-t pt-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Driver Costs</span>
            <span className="text-red-600">
              -{formatCurrency(finance.driverCost)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Tractor Costs</span>
            <span className="text-red-600">
              -{formatCurrency(finance.tractorLoadedCost)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Empty KM Costs</span>
            <span className="text-red-600">
              -{formatCurrency(finance.emptyKmCost)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Trailer Costs</span>
            <span className="text-red-600">
              -{formatCurrency(finance.trailerDayCost)}
            </span>
          </div>
        </div>

        {/* Total Cost */}
        <div className="flex justify-between items-center border-t pt-2">
          <span className="text-sm font-medium text-gray-700">Total Cost</span>
          <span className="font-semibold text-red-600">
            -{formatCurrency(finance.totalCost)}
          </span>
        </div>

        {/* Margin */}
        <div className="flex justify-between items-center border-t pt-2">
          <span className="text-sm font-medium text-gray-700">Margin</span>
          <div className="flex items-center gap-2">
            {finance.margin >= 0 ? (
              <TrendingUp size={16} className="text-green-600" />
            ) : (
              <TrendingDown size={16} className="text-red-600" />
            )}
            <span
              className={`font-bold text-lg ${
                finance.margin >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(finance.margin)}
            </span>
          </div>
        </div>

        {/* Margin Percentage */}
        {finance.revenue > 0 && (
          <div className="text-center">
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                finance.margin >= 0
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {((finance.margin / finance.revenue) * 100).toFixed(1)}% margin
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceSummary;
