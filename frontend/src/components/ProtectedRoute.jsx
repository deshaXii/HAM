import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  // لسه بنحمّل الـ /me من السيرفر
  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-10 text-gray-600">
        Loading...
      </div>
    );
  }

  // مفيش يوزر ⇒ يروح /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // عندنا يوزر ⇒ يعرض المحتوى المطلوب
  return children;
}
