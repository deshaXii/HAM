import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiGetState, apiSaveState } from "../lib/api";
import AdminDriverSchedule from "../components/AdminDriverSchedule";

export default function AdminDriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const [fullState, setFullState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const safeState = {
          ...apiState,
          drivers: Array.isArray(apiState?.drivers) ? apiState.drivers : [],
        };
        setFullState(safeState);
      } catch (err) {
        console.error("Failed to load state for drivers page:", err);
        setError("Failed to load drivers");
        setFullState({ drivers: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSaveDrivers(nextDrivers) {
    if (!fullState) return;
    setSaving(true);
    setError("");

    const nextState = {
      ...fullState,
      drivers: nextDrivers,
    };

    try {
      await apiSaveState(nextState);
      setFullState(nextState);
    } catch (err) {
      console.error("Failed to save drivers:", err);
      setError("Failed to save drivers");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-4 text-sm text-gray-500">
        You must be admin to view this page.
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {saving && <div className="text-xs text-blue-600">Saving drivers…</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}

      <AdminDriverSchedule
        drivers={fullState?.drivers || []}
        onSaveDrivers={handleSaveDrivers}
      />
    </div>
  );
}
