import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-10 text-gray-600">
        Loading...
      </div>
    );
  }

  // Not logged in? This is the same protection as ProtectedRoute
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // لوجين بس مش أدمن؟ خليه يروح للـ Planner
  if (user.role !== "ADMIN") {
    return <Navigate to="/plan" replace />;
  }

  return children;
}
