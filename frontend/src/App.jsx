// src/App.jsx
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";

import Admin from "./components/Admin";
import Login from "./components/Login";
import Reports from "./components/Reports";
import Signup from "./components/Signup";
import Profile from "./components/Profile";
import Planner from "./components/Planner";
import DayPlanner from "./components/DayPlanner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AdminRoute from "./components/AdminRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import Agenda from "./components/Agenda";
import { Truck, Users, CalendarDays, Printer, MapPin } from "lucide-react";
import AdminDriversPage from "./components/Drivers";
import LocationsMap from "./components/LocationsMap"; // <<< NEW

// -------- Navigation bar --------
function Navigation() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    {
      path: "/admin",
      icon: Users,
      label: "Admin",
      role: "admin",
      color: "text-purple-600",
    },
    {
      path: "/admin/drivers",
      icon: Users,
      label: "Drivers",
      role: "admin",
      color: "text-purple-600",
    },
    {
      path: "/plan",
      icon: Truck,
      label: "Planner",
      role: "normal",
      color: "text-blue-600",
    },
    {
      path: "/reports",
      icon: Printer,
      label: "Reports",
      role: "admin",
      color: "text-blue-600",
    },
    {
      path: "/agenda",
      icon: CalendarDays,
      label: "Agenda",
      color: "text-blue-600",
      role: "admin",
    },
    {
      path: "/locations",
      icon: MapPin,
      label: "Locations",
      color: "text-emerald-600",
      role: "admin", // نخليها للأدمن علشان تعديل اللوكيشنز
    },
  ];

  if (!user) return null;
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* left */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="logo" className="h-8 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">Planner</h1>
            </div>

            <div className="flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                // ADMIN يشوف كله
                if (user.role === "admin") {
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={18} className={item.color} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                }
                // USER عادي
                if (!item.role || item.role === "normal") {
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={18} className={item.color} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                }
                return null;
              })}

              <Link
                to="/profile"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === "/profile"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span className="font-medium">{user?.name || "Profile"}</span>
              </Link>
            </div>
          </div>

          {/* right */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              v1.3.9
            </span>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// -------- App root --------
function AppInner() {
  const { user } = useAuth();

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Planner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/day/:date"
              element={
                <ProtectedRoute>
                  <DayPlanner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plan"
              element={
                <ProtectedRoute>
                  <Planner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/locations"
              element={
                <AdminRoute>
                  <LocationsMap />
                </AdminRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/drivers"
              element={
                <AdminRoute>
                  <AdminDriversPage />
                </AdminRoute>
              }
            />
            <Route
              path="/agenda"
              element={
                <AdminRoute>
                  <Agenda />
                </AdminRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
