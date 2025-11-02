import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

import { apiGetState, apiSaveState } from "../lib/api";
import AdminDriverSchedule from "./AdminDriverSchedule";

export default function AdminDriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // If not logged in at all
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Main state coming from backend (/state)
  const [fullState, setFullState] = useState(null);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Saving state in case you want to show spinner or disable button
  const [saving, setSaving] = useState(false);

  // Get state when page opens
  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();

        // Ensure drivers array exists even if server doesn't return it
        const safeState = {
          ...apiState,
          drivers: Array.isArray(apiState?.drivers) ? apiState.drivers : [],
        };

        setFullState(safeState);
      } catch (err) {
        console.error("Failed to load state for drivers page:", err);
        setFullState({
          drivers: [],
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Function we'll pass to AdminDriverSchedule for when Save is clicked
  async function handleSaveDrivers(nextDriversArray) {
    if (!isAdmin) return;

    // Prepare new version of state
    const nextState = {
      ...fullState,
      drivers: nextDriversArray.map((d) => ({
        ...d,
        // Ensure fields needed by the rest of the system exist
        canNight: !!d.canNight,
        twoManOk: !!d.twoManOk,
        weekAvailability: Array.isArray(d.weekAvailability)
          ? d.weekAvailability
          : [],
        leaves: Array.isArray(d.leaves) ? d.leaves : [],
      })),
    };

    // Update UI immediately
    setFullState(nextState);

    // Send to backend to be saved
    try {
      setSaving(true);
      await apiSaveState(nextState);
    } catch (err) {
      console.error("Failed saving drivers schedule:", err);
      // You could show toast or alert here
      alert("Failed to save driver schedule on server.");
    } finally {
      setSaving(false);
    }
  }

  // Protection: if user is not admin, return them
  if (!isAdmin) {
    return <div className="p-4 text-sm text-gray-500">Admin only.</div>;
  }

  // If still loading state
  if (loading || !fullState) {
    return (
      <div className="p-6 text-gray-500 text-sm animate-pulse">
        Loading driver settings...
      </div>
    );
  }

  // State is ready
  return (
    <div className="min-h-screen bg-gray-50 py-6">
      {/* Small banner at top if saving operation is in progress */}
      {saving && (
        <div className="max-w-4xl mx-auto mb-4 text-[13px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Saving changes...
        </div>
      )}

      <AdminDriverSchedule
        drivers={fullState.drivers || []}
        onSaveDrivers={handleSaveDrivers}
      />
    </div>
  );
}
