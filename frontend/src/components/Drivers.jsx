// front/src/pages/AdminDriversPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiGetState, apiSaveState } from "../lib/api";
import AdminDriverSchedule from "../components/AdminDriverSchedule";

export default function AdminDriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!user) return <Navigate to="/login" replace />;

  const [fullState, setFullState] = useState(null);
  const [loading, setLoading] = useState(true);
  const savingRef = useRef(false);
  const latestDriversRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const apiState = await apiGetState();
        const safeState = {
          ...apiState,
          drivers: Array.isArray(apiState?.drivers) ? apiState.drivers : [],
        };
        setFullState(safeState);
        latestDriversRef.current = safeState.drivers;
      } catch (err) {
        console.error("Failed to load drivers:", err);
        setFullState({ drivers: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveDrivers(driversList, silent = false) {
    if (!isAdmin || !fullState) return;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const nextState = { ...fullState, drivers: driversList };
      await apiSaveState(nextState);
      setFullState(nextState);
    } catch (err) {
      if (!silent) alert("Failed to save drivers");
      console.error(err);
    } finally {
      savingRef.current = false;
    }
  }

  // Auto-save timer
  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(() => {
      if (latestDriversRef.current) saveDrivers(latestDriversRef.current, true);
    }, 10000);
    return () => clearInterval(id);
  }, [isAdmin]);

  // before unload save
  useEffect(() => {
    if (!isAdmin) return;
    const h = () => {
      if (latestDriversRef.current) {
        // ملاحظة: بعض المتصفحات تمنع async هنا — ده “محاولة”
        saveDrivers(latestDriversRef.current, true);
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isAdmin]);

  function handleSaveDrivers(nextDrivers) {
    latestDriversRef.current = nextDrivers;
    saveDrivers(nextDrivers);
  }

  if (!isAdmin) {
    return (
      <div className="p-4 text-sm text-gray-500">
        You must be admin to view this page.
      </div>
    );
  }
  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-4 space-y-4">
      <AdminDriverSchedule
        drivers={fullState?.drivers || []}
        onSaveDrivers={handleSaveDrivers}
      />
    </div>
  );
}
