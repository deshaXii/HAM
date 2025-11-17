// front/src/pages/Tasks.jsx
import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import AdminExtras from "../components/AdminExtras";

export default function TasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin)
    return (
      <div className="p-4 text-sm text-gray-500">
        Only admin can access this page.
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Tasks & Notices</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage tasks sent to other accounts and global notices. (Same API as
            dashboard extras)
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <AdminExtras />
        </div>
      </div>
    </div>
  );
}
